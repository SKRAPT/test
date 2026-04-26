/// <reference path='./online-streaming-provider.d.ts' />
/// <reference path='./doc.d.ts' />

class Provider {
  private BASE_URL: string = 'https://www.muitohentai.com';
  private SERVER_ID: string = 'muitohentai';

  getSettings(): Settings {
    return {
      episodeServers: ['muitohentai'],
      supportsDub: false
    };
  }

  private async fetchUrl(url: string): Promise<string> {
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'Referer': this.BASE_URL,
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
    if (!r.ok) throw new Error(`HTTP error ${r.status} ${r.statusText}`);
    return await r.text();
  }

  private makeAbsolute(url: string): string {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return this.BASE_URL + url;
    return this.BASE_URL + '/' + url;
  }

  async search(opts: SearchOptions): Promise<SearchResult[]> {
    const query = (opts.query || '').trim();
    if (!query) return [];

    const searchUrl = this.BASE_URL + '/buscar/' + encodeURIComponent(query) + '/';
    const html = await this.fetchUrl(searchUrl);
    const $: DocSelectionFunction = LoadDoc(html);
    const results: SearchResult[] = [];
    const seen: { [key: string]: boolean } = {};

    $('a[href*="/info/"]').each((index, el) => {
      const href = el.attr('href') ?? '';
      const title = el.text().trim();
      if (!href || !title) return;

      const absHref = this.makeAbsolute(href);
      if (seen[absHref]) return;
      seen[absHref] = true;

      results.push({
        id: absHref,
        title,
        url: absHref,
        subOrDub: 'sub'
      });
    });

    if (!results.length) return [];
    return [results[0]]; // primeira ocorrência
  }

  async findEpisodes(id: string): Promise<EpisodeDetails[]> {
    if (!id) return [];

    const html = await this.fetchUrl(id);
    const $: DocSelectionFunction = LoadDoc(html);
    const episodes: EpisodeDetails[] = [];
    const seen: { [key: string]: boolean } = {};

    $('a[href*="/episodios/"]').each((index, el) => {
      const href = el.attr('href') ?? '';
      const text = el.text().trim();
      if (!href || !text) return;

      const num = this.episodeNumberFromText(text) || episodes.length + 1;
      const key = `${num}|${href}`;
      if (seen[key]) return;
      seen[key] = true;

      episodes.push({
        id: href,
        number: num,
        title: text,
        url: this.makeAbsolute(href)
      });
    });

    episodes.sort((a, b) => a.number - b.number);
    return episodes;
  }

  private episodeNumberFromText(text: string): number | null {
    const m = text.match(/episodio[- ]*(\d+)/i);
    if (m) return parseInt(m[1], 10);
    return null;
  }

  async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
    const server = _server !== 'default' ? _server : this.SERVER_ID;
    const target = episode.url || episode.id;
    if (!target) return {
      headers: { referer: this.BASE_URL },
      server,
      videoSources: []
    };

    const html = await this.fetchUrl(target);
    const $: DocSelectionFunction = LoadDoc(html);
    const videoSources: VideoSources[] = [];
    const subtitles: Subtitles[] = [];

    // Procura iframe e/ou vídeo direto
    $('iframe').each((index, el) => {
      const src = el.attr('src') ?? '';
      if (!src) return;
      const url = this.makeAbsolute(src);
      videoSources.push({
        url,
        type: 'hls',
        quality: 'Auto',
        subtitles: subtitles
      });
    });

    return {
      headers: { referer: this.BASE_URL },
      server,
      videoSources
    };
  }
}
