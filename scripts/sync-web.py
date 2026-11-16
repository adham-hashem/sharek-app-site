"""Copy app source files into the website copy (sharek-site/web/src) and re-apply the website-only
differences. Usage (from SharekApp/): python sharek-site/scripts/sync-web.py . <relative file> [...]"""
import sys, pathlib
root = pathlib.Path(sys.argv[1]); app = root/'project'/'src'; web = root/'sharek-site'/'web'/'src'

def rep(s, old, new, path):
    assert s.count(old) == 1, (path, old[:90], s.count(old))
    return s.replace(old, new)

def patch_app(s, path):
    w = (web/'App.tsx').read_text(encoding='utf-8')
    start = w.index("// Website: a shared meal/marketplace link opens the web app.")
    capture = w[start:w.index("function App() {\n")]
    s = s.replace('src="/image.png"', "src={import.meta.env.BASE_URL+'image.png'}")
    s = rep(s, "redirectTo: native ? NATIVE_OAUTH_REDIRECT_URL : window.location.origin,",
            "redirectTo: native ? NATIVE_OAUTH_REDIRECT_URL : window.location.origin + import.meta.env.BASE_URL,", path)
    return rep(s, "function App() {\n", capture + "function App() {\n", path)

def patch_market(s, path):
    s = rep(s, "import {MarketShareSheet,type MarketShare} from './MarketShareSheet';",
            "import {MarketShareSheet,type MarketShare} from './MarketShareSheet';\nimport {parseSiteLink} from '@/lib/meal-share';", path)
    return rep(s, "url.protocol==='https:'&&url.hostname==='www.sharek.space'&&url.pathname.startsWith('/marketplace/')?url.pathname.split('/')[2]:null;",
               "parseSiteLink(raw,'marketplace');", path)

def patch_paths(s, path):
    s = s.replace("'/image.png'", "import.meta.env.BASE_URL+'image.png'").replace('src="/image.png"', "src={import.meta.env.BASE_URL+'image.png'}")
    return s.replace("'/firebase-messaging-sw.js'", "import.meta.env.BASE_URL+'firebase-messaging-sw.js'")

PATCHES = {'App.tsx': patch_app, 'components/GoodnessMarket.tsx': patch_market}
WEB_ONLY = {'lib/secure-storage.ts', 'lib/supabase.ts', 'lib/meal-share.ts'}  # never overwritten

for rel in sys.argv[2:]:
    if rel in WEB_ONLY:
        print('skip (website-specific):', rel); continue
    s = (app/rel).read_text(encoding='utf-8')
    s = PATCHES.get(rel, patch_paths)(s, rel)
    (web/rel).parent.mkdir(parents=True, exist_ok=True)
    (web/rel).write_text(s, encoding='utf-8', newline='')
    print('synced', rel)
