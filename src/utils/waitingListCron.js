// utils/waitingListCron.js
const WaitingList = require('../models/WaitingList');

const cleanupExpiredWaitingList = async () => {
    try {
        const expiredCount = await WaitingList.expireOldNotifications();
        if (expiredCount > 0) {
            console.log(`Cleaned up ${expiredCount} expired waiting list notifications`);
        }
    } catch (error) {
        console.error('Error cleaning up expired waiting list:', error);
    }
};

module.exports = { cleanupExpiredWaitingList };