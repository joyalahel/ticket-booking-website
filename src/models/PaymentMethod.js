const pool = require('../config/database');

class PaymentMethod {
    // Get all active payment methods (static list only - DB table not used)
    static async getActiveMethods() {
        return this.getFallbackMethods();
    }

    // Validate a method code is active
    static async isValid(code) {
        return this.getFallbackMethods().some((m) => m.code === code);
    }

    static getFallbackMethods() {
        return [
            { code: 'paypal', name: 'PayPal', description: 'Pay with PayPal account or card', category: 'international', requires_online: true, instant_confirmation: true },
            { code: 'stripe', name: 'Stripe', description: 'Secure online payments', category: 'international', requires_online: true, instant_confirmation: true },
            { code: 'checkout', name: 'Checkout.com', description: 'Global payment processing', category: 'international', requires_online: true, instant_confirmation: true },
            { code: 'card', name: 'Card', description: 'Visa / Debit card', category: 'cards', requires_online: true, instant_confirmation: true },
            { code: 'bank_transfer', name: 'Bank Transfer', description: 'Transfer to supported banks', category: 'local', requires_online: false, instant_confirmation: false },
            { code: 'whish', name: 'Whish Money', description: 'Mobile wallet payment', category: 'local', requires_online: false, instant_confirmation: false },
            { code: 'omt', name: 'OMT', description: 'Money transfer', category: 'local', requires_online: false, instant_confirmation: false },
            { code: 'bob_finance', name: 'Bob Finance', description: 'Finance payment', category: 'local', requires_online: false, instant_confirmation: false }
        ];
    }
}

module.exports = PaymentMethod;
