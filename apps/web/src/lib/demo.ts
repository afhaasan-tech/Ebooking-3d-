/**
 * Demo affordances (one-click demo accounts, payment-outcome simulator) are shown only in demo builds.
 * Build with VITE_DEMO_MODE=false to remove them from the UI.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false';
