const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel) => async (payload) => {
  const result = await ipcRenderer.invoke(channel, payload);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
contextBridge.exposeInMainWorld('sprint', {
  desktop: true,
  ready: invoke('renderer:ready'),
  settings: invoke('settings:get'), configure: invoke('settings:set'),
  search: invoke('images:search'), cancelSearch: invoke('images:cancel'),
  image: invoke('images:read'), registerCutout: invoke('images:cutout'),
  act: invoke('images:act'), library: invoke('library:list'),
  downloads: invoke('downloads:open'), source: invoke('source:open'),
  hide: invoke('window:hide'),
  onFocus: (callback) => { const listener = () => callback(); ipcRenderer.on('focus-search', listener); return () => ipcRenderer.removeListener('focus-search', listener); },
});
