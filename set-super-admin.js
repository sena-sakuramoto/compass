// スーパー管理者権限を設定するスクリプト
// 使用方法: node set-super-admin.js

const admin = require('firebase-admin');

// Firebase Admin SDK初期化
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function setSuperAdmin() {
    const email = 's.sakuramoto@archi-prisma.co.jp';

    try {
        console.log(`Setting super_admin role for ${email}...`);

        // メールアドレスでユーザーを検索
        const usersSnapshot = await db.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();

        if (usersSnapshot.empty) {
            console.error(`User with email ${email} not found!`);
            console.log('Please make sure the user has logged in at least once.');
            process.exit(1);
        }

        const userDoc = usersSnapshot.docs[0];
        const userId = userDoc.id;
        const userData = userDoc.data();

        console.log(`Found user: ${userData.displayName} (${userId})`);
        console.log(`Current role: ${userData.role}`);

        // スーパー管理者権限を設定
        await db.collection('users').doc(userId).update({
            role: 'super_admin',
            updatedAt: admin.firestore.Timestamp.now()
        });

        console.log('✅ Successfully set super_admin role!');
        console.log(`User ${email} is now a super administrator.`);

        process.exit(0);
    } catch (error) {
        console.error('Error setting super_admin role:', error);
        process.exit(1);
    }
}

setSuperAdmin();
