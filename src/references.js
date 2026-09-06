export async function searchReferences(references, { fetcher = fetch, email = process.env.CROSSREF_EMAIL, openalexKey = process.env.OPENALEX_API_KEY, signal } = {}) {
  const get = async url => {
    const timeout = AbortSignal.timeout(8000);
    const response = await fetcher(url, { headers: { 'User-Agent': `AbundancePeerReview/0.2${email ? ` (mailto:${email})` : ''}` }, signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: 'error' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Metadata service returned HTTP ${response.status}`);
    return response.json();
  };
  const parse = item => ({ source: 'Crossref', title: item.title?.[0] || '', authors: (item.author || []).slice(0, 8).map(a => [a.given, a.family].filter(Boolean).join(' ')), year: item.published?.['date-parts']?.[0]?.[0], journal: item['container-title']?.[0], doi: item.DOI, url: item.DOI ? `https://doi.org/${item.DOI}` : undefined });
  const results = [];
  // Bound upstream concurrency and return failures explicitly, never as no-match judgments.
  for (let i = 0; i < references.length; i += 3) {
    if (signal?.aborted) throw new Error('Reference lookup cancelled.');
    results.push(...await Promise.all(references.slice(i, i + 3).map(async reference => {
      const errors = [], matches = [];
      try {
        if (reference.doi) {
          const doi = reference.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim();
          const response = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
          if (response?.message) matches.push(parse(response.message));
        }
        if (!matches.length) {
          const url = new URL('https://api.crossref.org/works');
          url.searchParams.set('query.bibliographic', reference.title || reference.raw);
          url.searchParams.set('rows', '3');
          if (email) url.searchParams.set('mailto', email);
          const response = await get(url);
          matches.push(...(response?.message?.items || []).map(parse));
        }
      } catch (error) { if (signal?.aborted) throw new Error('Reference lookup cancelled.'); errors.push(`Crossref: ${error.message}`); }
      if (!matches.length && openalexKey) {
        try {
          const url = new URL('https://api.openalex.org/works');
          url.searchParams.set('search', reference.title || reference.raw);
          url.searchParams.set('per-page', '3');
          url.searchParams.set('api_key', openalexKey);
          const response = await get(url);
          matches.push(...(response?.results || []).map(item => ({ source: 'OpenAlex', title: item.title, authors: (item.authorships || []).slice(0, 8).map(a => a.author?.display_name), year: item.publication_year, journal: item.primary_location?.source?.display_name, doi: item.doi, url: item.id })));
        } catch { if (signal?.aborted) throw new Error('Reference lookup cancelled.'); errors.push('OpenAlex lookup failed.'); }
      }
      return { key: reference.key, results: matches, errors, note: 'Raw metadata candidates only. Compare title, authors, year, and venue. Missing matches do not prove a reference is fabricated.' };
    })));
  }
  return results;
}
