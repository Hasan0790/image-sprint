export class SearchTabs {
  constructor(api, changed = () => {}) { this.api = api; this.changed = changed; this.tabs = []; this.active = ''; this.add(); }
  add() { const tab = { id: crypto.randomUUID(), query: '', draft: '', filter: 'all', images: [], loading: false, error: '', page: 0, hasMore: false, requestId: null, revision: 0 }; this.tabs.push(tab); this.active = tab.id; this.changed(); return tab; }
  get current() { return this.tabs.find(t => t.id === this.active); }
  close(id) { const index = this.tabs.findIndex(t => t.id === id), tab = this.tabs[index]; if(!tab) return; if(tab.requestId) this.api.cancelSearch(tab.requestId).catch(() => {}); this.tabs.splice(index,1); if(this.active === id) this.active = this.tabs[Math.max(0,index-1)]?.id || ''; if(!this.tabs.length) this.add(); else this.changed(); }
  async search(id, query, filter = 'all', more = false) {
    const tab = this.tabs.find(t => t.id === id); if(!tab || !query.trim()) return;
    if(tab.requestId) this.api.cancelSearch(tab.requestId).catch(() => {});
    const revision = ++tab.revision;
    const page = more ? tab.page + 1 : 0;
    Object.assign(tab, { query: query.trim(), draft: query.trim(), filter, loading: true, error: '', requestId: crypto.randomUUID() });
    if(!more) { tab.images = []; tab.page = 0; tab.hasMore = false; }
    this.changed();
    try {
      const result = await this.api.search({ requestId: tab.requestId, query: tab.query, filter, page });
      if(!this.tabs.includes(tab) || tab.revision !== revision) return;
      const seen = new Set(more ? tab.images.map(i => i.url) : []);
      const fresh = result.images.filter(i => !seen.has(i.url) && seen.add(i.url));
      tab.images = more ? [...tab.images,...fresh] : fresh; tab.page = page; tab.hasMore = result.hasMore && fresh.length > 0;
    } catch(e) { if(this.tabs.includes(tab) && tab.revision === revision) tab.error = e.message; }
    finally { if(this.tabs.includes(tab) && tab.revision === revision) { tab.loading = false; tab.requestId = null; this.changed(); } }
  }
}
