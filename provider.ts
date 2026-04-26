// This is a Seanime onlinestream provider for MuitoHentai

/// <reference path='./online-streaming-provider.d.ts' />
/// <reference path='./doc.d.ts' />

class Provider {

  private BASE_URL: string = 'https://www.muitohentai.com';
  private SERVER_ID: string = 'muitohentai';

  private FALLBACKS_BY_MEDIA_ID: { [key: string]: string } = {
    '3559': 'stringendo',
    '4502': 'stringendo',
    '6194': 'stretta-the-animation'
  };

  private FALLBACKS_BY_TITLE: { [key: string]: string } = {
    'stringendo': 'stringendo',
    'stretta the animation': 'stretta-the-animation',
    'stretta the animation ova': 'stretta-the-animation',
    'stringendo accelerando ultimatum sera': 'stringendo',
    'stringendo accelerando ultimatum': 'stringendo'
  };

  getSettings(): Settings {
    return {
      episodeServers: ['muitohentai'],
      supportsDub: false
    };
  }

  private normalizeTitle(title: string): string {
    if (!title) title = ''

    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' ')
      .replace(/[:;,_\-.!?()\[\]{}"'`~@#$%^*+=|\/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private slugify(title: string): string {
    return this.normalizeTitle(title)
      .replace(/\s+/g, '-');
  }

  private makeAbsoluteUrl(url: string): string {
    if (!url) return '';
    if (url.indexOf('http') === 0) return url;
    if (url.charAt(0) === '/') return this.BASE_URL + url;
    return this.BASE_URL + '/' + url;
  }

  private async extractSearchResults(html: string): Promise<SearchResult[]> {
    const results: SearchResult[] = []
    const $: DocSelectionFunction = LoadDoc(html);
    const seen: { [key: string]: true } = {}

    $('a[href*="/info/"]').each((index: number, el: DocSelection) => {
      const title: string = el.text().trim();
      const href: string = el.attr('href') ?? '';

      if (!title || !href) return;

      const id = href
      const absoluteHref = this.makeAbsoluteUrl(href)

      if (seen[absoluteHref]) return;
      seen[absoluteHref] = true;

      results.push({
        id,
        title,
        url: absoluteHref,
        subOrDub: 'sub'
      });
    });

    return results;
  }

  private async fetchSearch(query: string): Promise<string> {
    const searchUrl = this.BASE_URL + '/buscar/' + encodeURIComponent(query) + '/'
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/html; charset=utf-8','Referer': this.BASE_URL
      }
    })
    if (!response.ok) throw new Error(`fetch failed: ${response.status} ${response.statusText}`)
    return response.text();
  }

  private pickBestResult(results: SearchResult[], query: string): SearchResult | null {
    if (!results || !results.length) return null;

    const nq = this.normalizeTitle(query);
    const qslug = this.slugify(query);

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const nt = this.normalizeTitle(r.title)

      if (nt === nq) return r;

      const slug = (r.url.split('/').filter(Boolean).pop() || '').toLowerCase()
      if (slug === qslug) return r;
    }

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const nt = this.normalizeTitle(r.title)
      if (nt.indexOf(nq) !== -1 || nq.indexOf(nt) !== -1) return r;
    }

    return results[0] ?? null;
  }

  private buildFallbackResult(opts: SearchOptions): SearchResult | null {
    let mediaId = opts && opts.mediaId ? String(opts.mediaId) : ''
    let query = opts && opts.query ? opts.query : ''
    const norm = this.normalizeTitle(query)
    let slug = ''

    if (mediaId && this.FALLBACKS_BY_MEDIA_ID[mediaId]) {
      slug = this.FALLBACKS_BY_MEDIA_ID[mediaId]
    } else if (norm && this.FALLBACKS_BY_TITLE[norm]) {
      slug = this.FALLBACKS_BY_TITLE[norm]
    } else if (norm) {
      slug = this.slugify(norm)
    }

    if (!slug) return null;

    const url = this.BASE_URL + '/info/' + slug + '/'

    return {
      id: url,
      title: query || slug,
      url,
      subOrDub: 'sub'
    };
  }

  async search(opts: SearchOptions): Promise<SearchResult[]> {
    const query = (opts && opts.query ? opts.query : '').trim()
    if (!query) return []

    const attempts: string[] = []
    const norm = this.normalizeTitle(query)

    if (norm) attempts.push(norm)

    let reduced = norm
      .replace(/(ova|special|uncensored|legendado|em portugues)/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (reduced && attempts.indexOf(reduced) === -1) {
      attempts.push(reduced)
    }

    const parts = reduced.split(' ')
    if (parts.length > 1) {
      const shortQ = parts.slice(0, Math.min(parts.length, 3)).join(' ')
      if (shortQ && attempts.indexOf(shortQ) === -1) {
        attempts.push(shortQ)
      }
    }

    let allResults: SearchResult[] = []
    const seen: { [key: string]: true } = {}

    for (let i = 0; i < attempts.length; i++) {
      const q = attempts[i]
      if (!q) continue

      try {
        const html = await this.fetchSearch(q)
        const results = await this.extractSearchResults(html)

        for (let j = 0; j < results.length; j++) {
          const r = results[j]
          if (!seen[r.url]) {
            seen[r.url] = true
            allResults.push(r)
          }
        }

        if (allResults.length) {
          const best = this.pickBestResult(allResults, query)
          if (best) return [best];
        }
      } catch (e) {
        console.warn('search attempt failed', q, e)
      }
    }

    const fallback = this.buildFallbackResult(opts)
    if (fallback) return [fallback];

    return [];
  }

  async findEpisodes(id: string): Promise<EpisodeDetails[]> {
    if (!id) return []

    const response = await fetch(id, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Referer': this.BASE_URL
      }
    });
    if (!response.ok) throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
    const html = await response.text();

    const $: DocSelectionFunction = LoadDoc(html);
    const episodes: EpisodeDetails[] = []
    const seen: { [key: string]: true } = {}

    $('a[href*="/episodios/"]').each((index, el) => {
      const href: string = el.attr('href') ?? ''
      if (!href) return;

      const absoluteHref = this.makeAbsoluteUrl(href)

      const text = el.text().trim()
      let number = episodes.length + 1
      const match = text.match(/epis[oóô]dio\s*(\d+)/i) || href.match(/episodio-(\d+)/i)
      if (match) number = parseInt(match[1], 10)

      const key = String(number) + '|' + absoluteHref
      if (seen[key]) return;
      seen[key] = true;

      episodes.push({
        id: absoluteHref,
        number,
        title: text || ('Episódio ' + number),
        url: absoluteHref
      });
    });

    episodes.sort((a, b) => a.number - b.number);
    return episodes;
  }

  async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
    const server = _server !== 'default' ? _server : this.SERVER_ID;

    const target = episode.url || episode.id || '';
    if (!target) {
      return {
        headers: {
          referer: this.BASE_URL
        },
        server: this.SERVER_ID,
        videoSources: []
      };
    }

    const response = await fetch(target, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Referer': this.BASE_URL
      }
    });
    if (!response.ok) throw new Error(`Episode fetch failed: ${response.status} ${response.statusText}`);
    const episodeHtml = await response.text();

    const iframeRegex = /<iframe[^>]+src=['"]([^'"]+)['"]/gi;
    let iframeMatches: string[] = [];
    let m;
    while ((m = iframeRegex.exec(episodeHtml)) !== null) {
      iframeMatches.push(m[1]);
    }

    const iframeUrls: string[] = []
    const seenFrames: { [key: string]: true } = {}

    for (let i = 0; i < iframeMatches.length; i++) {
      let frameUrl = iframeMatches[i];
      if (!frameUrl) continue;

      if (frameUrl.indexOf('http') !== 0) {
        if (frameUrl.charAt(0) === '/') {
          frameUrl = this.BASE_URL + frameUrl;
        } else {
          frameUrl = this.BASE_URL + '/' + frameUrl;
        }
      }

      if (seenFrames[frameUrl]) continue;
      seenFrames[frameUrl] = true;
      iframeUrls.push(frameUrl);
    }

    const videoSources: VideoSources[] = []
    const subtitles: Subtitles[] = []
    const seenVideos: { [key: string]: true } = {}
    const seenSubs: { [key: string]: true } = {}

    const videoRegex = /https?:\/\/[^"'<>\s]+\.(m3u8|mp4)(\?[^"'<>\s]*)?/gi;
    const subRegex = /https?:\/\/[^"'<>\s]+\.(vtt|srt)(\?[^"'<>\s]*)?/gi;

    function pushSubtitle(url: string, idx: string): void {
      if (!url || seenSubs[url]) return;
      seenSubs[url] = true;
      subtitles.push({
        id: 'sub-' + idx,
        url,
        language: 'Portuguese',
        isDefault: true
      });
    }

    function pushVideo(url: string): void {
      if (!url || seenVideos[url]) return;
      seenVideos[url] = true;
      const lower = url.toLowerCase();
      const type = lower.indexOf('.m3u8') !== -1 ? 'hls' : 'mp4';
      videoSources.push({
        url,
        type,
        quality: type === 'hls' ? 'Auto' : '720p',
        subtitles: subtitles
      });
    }

    const PROXY_URL = 'http://127.0.0.1:43211/api/v1/proxy?url=';

    for (let i = 0; i < iframeUrls.length; i++) {
      try {
        const proxyUrl = PROXY_URL + encodeURIComponent(iframeUrls[i])
        const frameResponse = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Referer': this.BASE_URL,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          }
        });
        if (!frameResponse.ok) continue;
        const frameHtml = await frameResponse.text();

        const subMatches = frameHtml.match(subRegex) || []
        const vidMatches = frameHtml.match(videoRegex) || []

        for (let j = 0; j < subMatches.length; j++) {
          pushSubtitle(subMatches[j], i + '-' + j);
        }

        for (let j = 0; j < vidMatches.length; j++) {
          pushVideo(vidMatches[j]);
        }
      } catch (e) {
        console.warn('iframe fetch failed', iframeUrls[i], e);
      }
    }

    // fallback: use iframe itself as video url if nothing found
    if (!videoSources.length) {
      for (let i = 0; i < iframeUrls.length; i++) {
        pushVideo(iframeUrls[i]);
      }
    }

    return {
      headers: {
        referer: this.BASE_URL
      },
      server,
      videoSources
    };
  }
}

