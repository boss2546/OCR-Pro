const DB_NAME = 'ocr-pro-history';
const DB_VERSION = 1;
const STORE_NAME = 'records';

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('sourceType', 'sourceType', { unique: false });
      }
    };
    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      dbInstance.onversionchange = () => { dbInstance.close(); dbInstance = null; };
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

const historyDB = {
  add(record) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const entry = { ...record, timestamp: Date.now() };
        const request = store.add(entry);
        request.onsuccess = () => {
          entry.id = request.result;
          resolve(entry);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  get(id) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  update(id, updates) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          if (!getReq.result) {
            reject(new Error(`Record ${id} not found`));
            return;
          }
          const record = { ...getReq.result, ...updates };
          const putReq = store.put(record);
          putReq.onsuccess = () => resolve(record);
          putReq.onerror = (e) => reject(e.target.error);
        };
        getReq.onerror = (e) => reject(e.target.error);
      });
    });
  },

  delete(id) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  getAll({ limit = 50, offset = 0 } = {}) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const results = [];
        let skipped = 0;
        const request = index.openCursor(null, 'prev');
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor || results.length >= limit) {
            resolve(results);
            return;
          }
          if (skipped < offset) {
            skipped++;
            cursor.continue();
            return;
          }
          results.push(cursor.value);
          cursor.continue();
        };
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  search(query) {
    const q = query.toLowerCase();
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const results = [];
        const request = store.openCursor();
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) {
            resolve(results);
            return;
          }
          const record = cursor.value;
          const text = `${record.rawText || ''} ${record.enhancedText || ''}`.toLowerCase();
          if (text.includes(q)) results.push(record);
          cursor.continue();
        };
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  clearAll() {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },
};

export default historyDB;
