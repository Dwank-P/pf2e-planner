const DATABASE = 'pf2e-planner-bridge-credentials';
const STORE = 'per-gm';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function key(url, integrationId) {
  // Browser-origin local IndexedDB; partition by website, integration, world and GM.
  return [url, integrationId, game.world.id, game.user.id].join('::');
}

async function perform(url, integrationId, mode, value) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve,reject) => {
      const tx = database.transaction(STORE, mode === 'read' ? 'readonly' : 'readwrite');
      const store = tx.objectStore(STORE);
      const request = mode === 'read'
        ? store.get(key(url,integrationId))
        : mode === 'delete'
          ? store.delete(key(url,integrationId))
          : store.put(value,key(url,integrationId));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { database.close(); }
}

/** Never write auth tokens to Foundry world settings or exported flags. */
export const credentials = {
  load: (url,id) => perform(url,id,'read'),
  save: (url,id,value) => perform(url,id,'write',value),
  remove: (url,id) => perform(url,id,'delete')
};
