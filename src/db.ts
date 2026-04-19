import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let firebaseConfig: any = {};
try {
  const configPath = path.join(__dirname, '../firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else {
    console.error("CRITICAL: firebase-applet-config.json not found at", configPath);
  }
} catch (err) {
  console.error("CRITICAL: Failed to parse firebase-applet-config.json", err);
}

const app = getApps().length === 0 && firebaseConfig.projectId
  ? initializeApp({ projectId: firebaseConfig.projectId })
  : (getApps().length > 0 ? getApp() : null);

const firestore = app ? getFirestore(app, firebaseConfig.firestoreDatabaseId) : null;

export const db = {
  get: async (query: string, params: any[] = []) => {
    const q = query.toLowerCase();
    if (!firestore) return null;
    if (q.includes("from users where uid = ?")) {
      const doc = await firestore.collection('users').doc(params[0]).get();
      return doc.exists ? doc.data() : null;
    }
    if (q.includes("from schools where school_id = ?")) {
      const doc = await firestore.collection('schools').doc(params[0]).get();
      return doc.exists ? doc.data() : null;
    }
    if (q.includes("from schools where school_slug = ?")) {
      const snapshot = await firestore.collection('schools').where('school_slug', '==', params[0]).limit(1).get();
      return snapshot.empty ? null : snapshot.docs[0].data();
    }
    if (q.includes("from schools where school_name = ?")) {
      const snapshot = await firestore.collection('schools').where('school_name', '==', params[0]).limit(1).get();
      return snapshot.empty ? null : snapshot.docs[0].data();
    }
    if (q.includes("from schools where referral_code = ?")) {
      const snapshot = await firestore.collection('schools').where('referral_code', '==', params[0]).limit(1).get();
      return snapshot.empty ? null : snapshot.docs[0].data();
    }
    if (q.includes("from stats where key = ?")) {
      const doc = await firestore.collection('stats').doc(params[0]).get();
      return doc.exists ? doc.data() : null;
    }
    if (q.includes("select count(*) as count from users")) {
      const snapshot = await firestore.collection('users').count().get();
      return { count: snapshot.data().count };
    }
    if (q.includes("select count(*) as count from schools")) {
      const snapshot = await firestore.collection('schools').count().get();
      return { count: snapshot.data().count };
    }
    return null;
  },

  run: async (query: string, params: any[] = []) => {
    const q = query.toLowerCase();
    if (!firestore) return { changes: 0 };
    if (q.includes("insert into users (uid, credits)")) {
      await firestore.collection('users').doc(params[0]).set({
        uid: params[0],
        credits: params[1],
        createdAt: new Date().toISOString()
      });
    }
    else if (q.includes("update users set credits = credits + ? where uid = ?")) {
      await firestore.collection('users').doc(params[1]).update({
        credits: FieldValue.increment(params[0])
      });
    }
    else if (q.includes("update users set credits = max(0, credits - ?) where uid = ?")) {
      await firestore.collection('users').doc(params[1]).update({
        credits: FieldValue.increment(-params[0])
      });
    }
    else if (q.includes("update users set credits = ? where uid = ?")) {
      await firestore.collection('users').doc(params[1]).update({
        credits: params[0]
      });
    }
    else if (q.includes("insert into schools")) {
      await firestore.collection('schools').doc(params[0]).set({
        school_id: params[0],
        school_name: params[1],
        school_slug: params[2],
        referral_code: params[3],
        password: params[4],
        total_students: 0,
        total_earnings: 0,
        createdAt: new Date().toISOString()
      });
    }
    else if (q.includes("update users set schoolid = ? where uid = ?")) {
      await firestore.collection('users').doc(params[1]).update({
        schoolId: params[0]
      });
    }
    else if (q.includes("update schools set total_students = total_students + 1 where school_id = ?")) {
      await firestore.collection('schools').doc(params[0]).update({
        total_students: FieldValue.increment(1)
      });
    }
    else if (q.includes("update schools set total_earnings = total_earnings + ? where school_id = ?")) {
      await firestore.collection('schools').doc(params[1]).update({
        total_earnings: FieldValue.increment(params[0])
      });
    }
    else if (q.includes("update schools set total_earnings = total_earnings - ? where school_id = ?")) {
      await firestore.collection('schools').doc(params[1]).update({
        total_earnings: FieldValue.increment(-params[0])
      });
    }
    else if (q.includes("update stats set value = value + ? where key = ?")) {
      await firestore.collection('stats').doc(params[1]).set({
        value: FieldValue.increment(params[0])
      }, { merge: true });
    }
    else if (q.includes("insert into activity")) {
      await firestore.collection('activity').add({
        type: params[0],
        details: params[1],
        timestamp: params[2]
      });
    }
    else if (q.includes("insert into withdrawals")) {
      await firestore.collection('withdrawals').doc(params[0]).set({
        id: params[0],
        school_id: params[1],
        amount: params[2],
        status: params[3],
        timestamp: params[4]
      });
    }
    else if (q.includes("update withdrawals set status = 'paid' where id = ?")) {
      await firestore.collection('withdrawals').doc(params[0]).update({
        status: 'paid'
      });
    }
    return { changes: 1 };
  },

  all: async (query: string, params: any[] = []) => {
    const q = query.toLowerCase();
    if (!firestore) return [];
    if (q.includes("from activity order by timestamp desc limit")) {
      const limit = parseInt(query.match(/limit (\d+)/i)?.[1] || "20");
      const snapshot = await firestore.collection('activity').orderBy('timestamp', 'desc').limit(limit).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    if (q.includes("from withdrawals where school_id = ?")) {
      const snapshot = await firestore.collection('withdrawals').where('school_id', '==', params[0]).orderBy('timestamp', 'desc').get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    if (q.includes("from stats")) {
      const snapshot = await firestore.collection('stats').get();
      return snapshot.docs.map(doc => ({ key: doc.id, ...doc.data() }));
    }
    if (q.includes("from schools")) {
      const snapshot = await firestore.collection('schools').get();
      return snapshot.docs.map(doc => doc.data());
    }
    if (q.includes("from users")) {
      const snapshot = await firestore.collection('users').get();
      return snapshot.docs.map(doc => doc.data());
    }
    if (q.includes("from withdrawals")) {
      const snapshot = await firestore.collection('withdrawals').orderBy('timestamp', 'desc').get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    return [];
  },

  exec: async (query: string) => {
    return;
  }
};

export async function getDb() {
  return db;
}
