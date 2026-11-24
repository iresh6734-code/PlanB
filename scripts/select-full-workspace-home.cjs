const { CRM_ORIGIN } = require('./start-full-workspace.cjs');

async function selectWorkspaceHome(fetcher = fetch) {
  const crm = CRM_ORIGIN + '/';
  const verifica = CRM_ORIGIN + '/verifica.html';
  const options = { redirect: 'error', signal: AbortSignal.timeout(2500) };
  try {
    const health = await fetcher(CRM_ORIGIN + '/api/verifica/health', options);
    if (!health.ok) return crm;
    const capability = await health.json();
    if (capability.ok !== true || capability.engagements !== true) return crm;

    const page = await fetcher(verifica, options);
    if (!page.ok || !/^text\/html\b/i.test(page.headers.get('content-type') ?? '')) return crm;
    return /<title>\s*Plan B Verifica\b/i.test(await page.text()) ? verifica : crm;
  } catch {
    return crm;
  }
}

if (require.main === module) void selectWorkspaceHome().then(url => console.log(url));
module.exports = { selectWorkspaceHome };
