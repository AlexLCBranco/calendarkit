// The site's version in the page's bottom-right corner ("v1.3.0"), so the live site can be checked against the
// latest push; the commit and build time are in its tooltip. Part of the app shell, not the widgets (never in a copy).

import { dateFormat } from './data/model';

export function SiteVersion({ version, commit, builtAt }: { version: string; commit: string; builtAt: string }) {
  const t = Date.parse(builtAt);
  const when = Number.isNaN(t) ? '' : `, built ${dateFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t)}`;
  return (
    <div className="app-version" data-testid="site-version" title={`Version ${version} · commit ${commit}${when}`}>
      v{version}
    </div>
  );
}
