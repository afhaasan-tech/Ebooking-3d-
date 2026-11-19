import type { Db } from '../db';
import type { AuthUser } from '../auth';
import type { BookingService } from '../services/booking';
import { newReference } from '../services/booking';
import { formatKWD } from '@ebooking/shared';

/**
 * Booking Recovery Assistant.
 * - Tools are allow-listed and bound to the authenticated user (no tool accepts a user id).
 * - Tools are read-only except: reconcile (asks the PROVIDER for verified status; never charges)
 *   and create_case (opens a support ticket).
 * - Tool selection is deterministic; user text is never executed as instructions.
 * - Every tool call is written to audit_logs.
 */
type Lang = 'ar' | 'en';
export interface AssistantReply {
  reply: string;
  actions: { type: 'open_order' | 'open_case' | 'retry_payment' | 'view_tickets'; ref?: string }[];
  toolCalls: string[];
  verified: boolean;
}

const INJECTION = /(ignore (all |the )?(previous|above)|system prompt|you are now|developer mode|تجاهل (كل )?التعليمات|انس(ى)? التعليمات|act as admin|issue (a |the )?tickets? (now|for free)|mark (it|payment) (as )?paid|refund me now)/i;
const PAYMENT_ISSUE = /(انسحب|انخصم|خصم|سحب|انقطع|charged|deducted|paid|money|المبلغ|فلوس|payment|دفعت|دفع)/i;
const NO_TICKET = /(ما طلع|ما وصل|ماطلع|ما جات|ما جاني|no ticket|didn'?t get|not received|missing|التذكره|التذكرة|tickets?)/i;
const REFUND = /(استرجاع|استرداد|ترجيع|refund)/i;

export class SupportAssistant {
  constructor(
    private readonly db: Db,
    private readonly booking: BookingService,
  ) {}

  private async tool<T>(user: AuthUser, name: string, args: object, fn: () => Promise<T>, calls: string[]): Promise<T> {
    calls.push(name);
    await this.db.query(`insert into public.audit_logs(actor_id, action, entity, entity_id, details) values ($1,'ai.tool_call','assistant',$2,$3)`, [user.id, name, JSON.stringify(args)]);
    return fn();
  }

  async handle(user: AuthUser, message: string, orderRef?: string): Promise<AssistantReply> {
    const lang: Lang = /[؀-ۿ]/.test(message) ? 'ar' : 'en';
    const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
    const calls: string[] = [];

    if (INJECTION.test(message)) {
      return {
        reply: t('أقدر أساعدك بشرح حالة حجزك والدفع من بياناتنا الموثّقة فقط. ما أقدر أصدر تذاكر أو أعدّل مدفوعات أو أسوي استرجاع مباشرة. إذا عندك مشكلة بطلب معيّن، عطني رقم الحجز.', 'I can only explain your booking and payment status from verified records. I cannot issue tickets, modify payments or perform refunds. If you have an issue with an order, share its reference.'),
        actions: [],
        toolCalls: calls,
        verified: false,
      };
    }

    // tool: find the relevant order — scoped to this user only
    const refMatch = (orderRef ?? message).toUpperCase().match(/EBK-[A-Z0-9]{8}/);
    const order = await this.tool(user, 'get_my_order', { ref: refMatch?.[0] ?? 'latest_unresolved' }, () =>
      refMatch
        ? this.db.one<any>(`select id, reference, status from public.orders where reference = $1 and user_id = $2`, [refMatch[0], user.id])
        : this.db.one<any>(`select id, reference, status from public.orders where user_id = $1 order by (status <> 'confirmed') desc, created_at desc limit 1`, [user.id]),
    calls);

    if (!order) {
      return {
        reply: refMatch
          ? t(`ما لقيت حجز بالرقم ${refMatch[0]} مربوط بحسابك.`, `I couldn't find order ${refMatch[0]} on your account.`)
          : t('ما لقيت أي حجوزات على حسابك. إذا دفعت من حساب ثاني، سجّل دخول فيه.', 'I found no orders on your account. If you paid from another account, sign in with it.'),
        actions: [],
        toolCalls: calls,
        verified: true,
      };
    }

    const paymentConcern = PAYMENT_ISSUE.test(message) || NO_TICKET.test(message);
    if (paymentConcern && ['payment_processing', 'payment_failed', 'expired'].includes(order.status)) {
      // tool: ask the payment provider for the VERIFIED status (never initiates a charge)
      await this.tool(user, 'verify_payment_status', { ref: order.reference }, () => this.booking.reconcileOrder(order.id), calls);
    }
    const view = await this.tool(user, 'get_order_status', { ref: order.reference }, () => this.booking.orderView(order.id, user.id), calls);
    const lastPay = view.payments[view.payments.length - 1];
    const total = formatKWD(view.totalFils, lang);
    const actions: AssistantReply['actions'] = [{ type: 'open_order', ref: view.reference }];
    let reply: string;

    switch (view.status) {
      case 'confirmed':
        reply = t(
          `حجزك ${view.reference} مؤكد ✅ والدفع (${total}) متحقق منه من مزوّد الدفع. تذاكرك (${view.tickets.length}) موجودة في صفحة "تذاكري". ملاحظة: هذا حجز تجريبي.`,
          `Your order ${view.reference} is confirmed ✅ and the payment (${total}) is verified with the provider. Your ${view.tickets.length} ticket(s) are in "My Tickets". Note: this is a demo booking.`,
        );
        actions.push({ type: 'view_tickets' });
        break;
      case 'payment_processing':
        reply = t(
          `الدفع لحجز ${view.reference} لسه قيد التحقق ⏳. ما نقدر نأكد إنه انسحب أو لا لين يرد مزوّد الدفع. لا تعيد الدفع — راح نحدّث الحالة تلقائياً، وإذا تأكد الدفع تطلع تذاكرك مباشرة بدون أي خصم إضافي.`,
          `Payment for ${view.reference} is still being verified ⏳. We can't confirm whether you were charged until the provider responds. Please don't pay again — the status updates automatically and tickets are issued once payment is verified, with no extra charge.`,
        );
        break;
      case 'payment_failed':
        reply = t(
          `آخر محاولة دفع لحجز ${view.reference} فشلت حسب مزوّد الدفع، يعني ما تم أي خصم مؤكد. تقدر تحاول مرة ثانية بنفسك من صفحة الحجز${view.items.length ? ' والكراسي لسه محجوزة لك لفترة محدودة' : ''}.`,
          `The last payment attempt for ${view.reference} failed according to the provider, so no verified charge exists. You can retry yourself from the order page${view.items.length ? ' while your seats remain held for a limited time' : ''}.`,
        );
        actions.push({ type: 'retry_payment', ref: view.reference });
        break;
      case 'reconciliation_required': {
        reply = t(
          `تأكدنا إن الدفع (${total}) وصلنا ✅ بس الكراسي ما انحجزت لك لأن مدة الحجز المؤقت انتهت وانباعت. ما راح نصدر تذكرة غير صحيحة. فتحنا لك طلب دعم ${view.supportCase?.reference ?? ''} بأولوية عاجلة، والفريق راح يعرض عليك كراسي بديلة أو استرجاع كامل بعد التحقق.`,
          `We verified your payment (${total}) ✅ but your seats were released after the hold expired and were sold. We will not issue an invalid ticket. Support case ${view.supportCase?.reference ?? ''} is open with urgent priority; the team will offer alternative seats or a full refund after verification.`,
        );
        actions.push({ type: 'open_case', ref: view.supportCase?.reference });
        break;
      }
      case 'refunded':
        reply = t(`تم استرجاع مبلغ حجز ${view.reference} وتأكد من مزوّد الدفع.`, `Order ${view.reference} was refunded and the refund is confirmed by the provider.`);
        break;
      case 'expired':
        reply = t(`حجز ${view.reference} انتهت مدته قبل الدفع، وما فيه أي دفعة متحقق منها.`, `Order ${view.reference} expired before payment; there is no verified payment.`);
        break;
      default:
        reply = t(`حالة حجز ${view.reference}: ${view.status}.`, `Order ${view.reference} status: ${view.status}.`);
    }

    if (REFUND.test(message) && view.status === 'confirmed') {
      reply += t(' بالنسبة للاسترجاع: ما أقدر أسويه بنفسي، لكن أقدر أفتح لك طلب دعم للمراجعة حسب سياسة الإلغاء.', ' About refunds: I cannot perform one, but I can open a support case for review under the cancellation policy.');
    }

    // escalate when a verified-payment problem or unresolved verification persists
    const needsCase = view.status === 'payment_processing' && lastPay && Date.now() - new Date(lastPay.created_at).getTime() > 10 * 60_000;
    if (needsCase || (REFUND.test(message) && view.status === 'confirmed')) {
      const ref = await this.tool(user, 'create_support_case', { ref: view.reference }, async () => {
        const r = newReference('SUP');
        await this.db.query(
          `insert into public.support_cases(reference, user_id, order_id, subject, category, status, priority, transcript) values ($1,$2,$3,$4,'payment','open',$5,$6)`,
          [r, user.id, view.id, REFUND.test(message) ? 'Refund request' : 'Payment verification delayed', needsCase ? 'high' : 'normal', JSON.stringify([{ from: 'customer', text: message.slice(0, 1000) }])],
        );
        return r;
      }, calls);
      reply += t(` فتحت لك طلب دعم رقم ${ref}.`, ` I opened support case ${ref}.`);
      actions.push({ type: 'open_case', ref });
    }

    return { reply, actions, toolCalls: calls, verified: true };
  }
}
