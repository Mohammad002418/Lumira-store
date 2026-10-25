"""End-to-end browser tests. Usage: python3 tests/e2e.py  (starts its own server)."""
import json, os, re, signal, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_CMD = os.environ.get("LUMIRA_SERVER_CMD", "node --disable-warning=ExperimentalWarning server.js").split()
if os.environ.get("NETLIFY_BUILD") == "1":
    SERVER_CMD = ["node", "dev-netlify.mjs"]
PORT = 3400
BASE = f"http://127.0.0.1:{PORT}"
DB = os.path.join(tempfile.mkdtemp(prefix="lumira-e2e-"), "e2e.db")
results = []
def check(name, ok, detail=""):
    results.append((bool(ok), name, detail))

def start_server():
    env = dict(os.environ, PORT=str(PORT), HOST="127.0.0.1", LUMIRA_DB=DB, LUMIRA_DATA=DB, RATE_LIMIT="100000")
    proc = subprocess.Popen(SERVER_CMD, cwd=ROOT, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            urllib.request.urlopen(BASE + "/api/health", timeout=1); return proc
        except Exception:
            time.sleep(0.1)
    raise SystemExit("server did not start")

server = start_server()
CATS = {"smartphones": "Smartphones", "laptops": "Laptops & Computers", "smartwatches": "Smartwatches", "audio": "Headphones & Audio", "accessories": "Accessories & Chargers"}
PAGES = ["index.html", "products.html", "product.html?id=laptop-flip", "cart.html", "checkout.html", "contact.html", "about.html", "shipping.html", "returns.html", "warranty.html", "privacy.html", "terms.html"] + [f"category-{c}.html" for c in CATS]
SIZES = {"phone": (375, 740), "tablet": (768, 1024), "laptop": (1280, 800), "desktop": (1920, 1080)}

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---- 1. every page loads cleanly; no console errors; no CSP violations ----
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" and "favicon" not in m.text else None)
        for path in PAGES:
            errors.clear()
            resp = page.goto(f"{BASE}/{path}")
            page.wait_for_timeout(350)
            check(f"loads {path}", resp.status == 200, f"status {resp.status}")
            check(f"no JS/CSP errors on {path}", not errors, "; ".join(errors))

        # ---- 2. link audit: follow every internal link on key pages ----
        seen = set(); broken = []
        for start in ["index.html", "products.html", "cart.html"]:
            page.goto(f"{BASE}/{start}"); page.wait_for_timeout(300)
            hrefs = page.eval_on_selector_all("a[href]", "els => els.map(e => e.getAttribute('href'))")
            for h in hrefs:
                if h.startswith(("http", "mailto", "#")) or h == "#" or not h: continue
                target = h.split("#")[0]
                if target in seen: continue
                seen.add(target)
                r = page.request.get(f"{BASE}/{target}")
                if r.status != 200: broken.append(f"{target}={r.status}")
        check("all internal links resolve (200)", not broken, ", ".join(broken))

        # ---- 3. homepage category cards open the five category pages ----
        page.goto(f"{BASE}/index.html"); page.wait_for_selector("#cat-grid a.cat-card")
        cards = page.eval_on_selector_all("#cat-grid a.cat-card", "els => els.map(e => e.getAttribute('href'))")
        check("homepage shows five category cards", len(cards) == 5, str(cards))
        for cid, cname in CATS.items():
            page.goto(f"{BASE}/index.html"); page.wait_for_selector("#cat-grid a.cat-card")
            page.click(f'#cat-grid a[href="category-{cid}.html"]')
            page.wait_for_url(re.compile(rf"category-{cid}\.html$"))
            page.wait_for_selector("#results article.card")
            title = page.text_content("#page-title")
            count = page.locator("#results article.card").count()
            check(f"category page {cid} opens and lists products", title.strip() == cname and count > 0, f"title={title!r} count={count}")
            cat_group_hidden = page.is_hidden("#f-cat-group")
            check(f"category page {cid} locks the category filter", cat_group_hidden)

        # ---- 4. product card selection navigates to the product page ----
        page.goto(f"{BASE}/category-laptops.html"); page.wait_for_selector("#results article.card")
        first_link = page.get_attribute("#results article.card a.card-link", "href")
        page.click("#results article.card a.card-link")
        page.wait_for_url(re.compile(r"product\.html\?id="))
        check("clicking a product card opens its page", page.url.endswith(first_link), f"{page.url} vs {first_link}")
        page.wait_for_selector("#product-root h1")
        check("product page shows the product name", page.text_content("#product-root h1").strip() != "")

        # ---- 5. cart flow: add, badge, cart page, quantity, remove, persistence ----
        page.goto(f"{BASE}/product.html?id=wireless-mouse"); page.wait_for_selector("#add")
        page.click("#inc"); page.click("#inc")
        page.click("#add"); page.wait_for_timeout(500)
        check("add to cart from product page shows toast", "added" in page.text_content("#toast").lower())
        badge = page.text_content("#cart-count")
        check("cart badge shows 3 after adding 3", badge.strip() == "3", badge)
        page.goto(f"{BASE}/products.html"); page.wait_for_selector("#results article.card")
        page.click('#results article.card button[data-add="power-bank"]'); page.wait_for_timeout(400)
        check("cart badge updates from catalog add button", page.text_content("#cart-count").strip() == "4")
        page.goto(f"{BASE}/cart.html"); page.wait_for_selector("#lines .line")
        lines = page.locator("#lines .line").count()
        check("cart shows two lines", lines == 2, str(lines))
        sub = page.text_content("#sub")
        check("cart subtotal correct (3×$19 + 1×$39 = $96)", sub.strip() == "$96.00", sub)
        page.click('button[data-inc="wireless-mouse"]'); page.wait_for_timeout(300)
        check("cart quantity increase updates subtotal", page.text_content("#sub").strip() == "$115.00", page.text_content("#sub"))
        page.click('button[data-rm="power-bank"]'); page.wait_for_timeout(300)
        check("cart remove updates subtotal", page.text_content("#sub").strip() == "$76.00", page.text_content("#sub"))
        page.reload(); page.wait_for_selector("#lines .line")
        check("cart survives page reload (saved in database)", page.locator("#lines .line").count() == 1)

        # ---- 6. checkout validation and order placement ----
        page.goto(f"{BASE}/checkout.html"); page.wait_for_selector("#form:not([hidden])")
        page.click("#place"); page.wait_for_timeout(400)
        check("checkout shows field errors when empty", page.text_content('[data-err="name"]').strip() != "" and page.text_content('[data-err="email"]').strip() != "")
        check("invalid fields are marked aria-invalid", page.get_attribute("#f-email", "aria-invalid") == "true")
        page.fill("#f-name", "Sara Ali"); page.fill("#f-email", "sara@example.com"); page.fill("#f-phone", "+249 912 345678")
        page.fill("#f-street", "12 Main Street"); page.fill("#f-city", "Khartoum"); page.fill("#f-country", "Sudan"); page.fill("#f-postal", "11111")
        page.click("#place"); page.wait_for_selector("text=Thank you")
        ref = re.search(r"LM-[A-Z0-9]+-[A-F0-9]{4}", page.text_content("body"))
        check("order placed and reference shown", ref is not None, ref.group(0) if ref else "")
        health = json.loads(urllib.request.urlopen(BASE + "/api/health").read())
        check("order stored in database", health["orders"] >= 1, str(health))
        page.goto(f"{BASE}/cart.html"); page.wait_for_timeout(400)
        check("cart is empty after order", page.is_visible("#empty"))

        # ---- 7. search, filters, sort ----
        page.goto(f"{BASE}/products.html?q=smartphone"); page.wait_for_selector("#results article.card")
        check("search finds smartphones", page.locator("#results article.card").count() == 3)
        page.fill("#f-q", "zzzz-nothing"); page.wait_for_timeout(200)
        check("search with no match shows empty state", page.is_visible("#empty"))
        page.click("#f-reset"); page.wait_for_timeout(200)
        page.select_option("#f-sort", "price-desc"); page.wait_for_timeout(200)
        prices = page.eval_on_selector_all("#results .price", "els => els.map(e => parseFloat(e.textContent.replace(/[^0-9.]/g, '')))")
        check("sort by price high to low", prices == sorted(prices, reverse=True))
        page.check("#f-stock"); page.wait_for_timeout(150)
        check("in-stock filter keeps products", page.locator("#results article.card").count() > 0)

        # ---- 7b. footer and content ----
        page.goto(f"{BASE}/index.html"); page.wait_for_selector("footer.site-footer")
        footer_mail = page.get_attribute("footer a.foot-mail", "href")
        check("footer shows support email", footer_mail == "mailto:noorsmam99@gmail.com", str(footer_mail))
        footer_links = page.eval_on_selector_all("footer a[href]", "els => els.map(e => e.getAttribute('href'))")
        check("footer policy links present", all(x in footer_links for x in ["shipping.html", "returns.html", "warranty.html", "privacy.html", "terms.html"]))
        page.goto(f"{BASE}/contact.html"); page.wait_for_selector("#contact-form")
        check("contact page shows email", page.locator('a[href="mailto:noorsmam99@gmail.com"]').count() >= 1)
        page.goto(f"{BASE}/contact.html"); page.wait_for_selector("#contact-form")
        page.click('#contact-form button[type="submit"]'); page.wait_for_timeout(300)
        check("contact shows field errors when empty", page.text_content('[data-err="name"]').strip() != "")
        for pth in ["index.html", "about.html", "contact.html", "shipping.html", "returns.html", "warranty.html", "privacy.html", "terms.html", "cart.html", "checkout.html", "products.html", "product.html?id=laptop-flip"]:
            page.goto(f"{BASE}/{pth}"); page.wait_for_timeout(200)
            txt = page.text_content("main") or ""
            check(f"no placeholder text on {pth}", "to be provided" not in txt.lower() and "to be added" not in txt.lower() and "[" not in txt, pth)
        # ---- 8. contact and newsletter ----
        page.goto(f"{BASE}/contact.html"); page.wait_for_selector("#contact-form")
        page.fill("#c-name", "Sara Ali"); page.fill("#c-email", "sara@example.com"); page.fill("#c-msg", "Do you deliver to Port Sudan?")
        page.click('#contact-form button[type="submit"]'); page.wait_for_timeout(400)
        check("contact form saves message", "Thanks" in page.text_content("#cmsg"), page.text_content("#cmsg"))
        page.goto(f"{BASE}/index.html"); page.wait_for_selector("#newsletter")
        page.fill("#nl-email", "fan@example.com"); page.click('#newsletter button[type="submit"]'); page.wait_for_timeout(400)
        check("newsletter subscribe works", "Thanks" in page.text_content("#nl-msg"), page.text_content("#nl-msg"))
        page.fill("#nl-email", "not-an-email")
        page.click('#newsletter button[type="submit"]'); page.wait_for_timeout(400)
        check("newsletter rejects bad email in the browser flow", "valid email" in page.text_content("#nl-msg").lower(), page.text_content("#nl-msg"))
        ctx.close()

        # ---- 9. responsive: no sideways scrolling at each screen size ----
        for sname, (w, h) in SIZES.items():
            c2 = browser.new_context(viewport={"width": w, "height": h})
            pg = c2.new_page()
            for path in PAGES:
                pg.goto(f"{BASE}/{path}"); pg.wait_for_timeout(250)
                over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                check(f"no sideways scroll: {sname} {path}", over <= 0, f"{over}px")
            if sname == "phone":
                pg.goto(f"{BASE}/index.html"); pg.wait_for_timeout(200)
                check("phone: menu hidden until opened", not pg.is_visible("#site-nav"))
                pg.click(".menu-toggle"); check("phone: menu opens", pg.is_visible("#site-nav"))
            c2.close()

        # ---- 10. speed: page load timings and transfer size ----
        ctx = browser.new_context(); pg = ctx.new_page()
        for path in ["index.html", "products.html", "category-smartphones.html", "product.html?id=laptop-flip", "cart.html"]:
            t0 = time.time(); pg.goto(f"{BASE}/{path}", wait_until="load"); ms = (time.time() - t0) * 1000
            check(f"fast load {path} (< 1500 ms local)", ms < 1500, f"{ms:.0f} ms")
        ctx.close()
        browser.close()

    # ---- 11. cart survives a server restart (database persistence) ----
    ctx = None
    with sync_playwright() as p:
        b = p.chromium.launch(); c3 = b.new_context(); pg = c3.new_page()
        pg.goto(f"{BASE}/product.html?id=headphones-navy"); pg.wait_for_selector("#add")
        pg.click("#add"); pg.wait_for_timeout(400)
        before = pg.text_content("#cart-count").strip()
        server.send_signal(signal.SIGTERM); server.wait(timeout=10)
        server = start_server()
        pg.goto(f"{BASE}/cart.html"); pg.wait_for_timeout(400)
        after = pg.text_content("#cart-count").strip()
        check("cart survives server restart (persistent database)", before == "1" and after == "1", f"before={before} after={after}")
        b.close()
finally:
    try: server.send_signal(signal.SIGTERM)
    except Exception: pass

passed = sum(1 for ok, _, _ in results if ok)
failed = [r for r in results if not r[0]]
for ok, name, detail in results:
    if not ok: print("FAIL", name, "|", detail)
print(f"E2E: {passed} passed, {len(failed)} failed, {len(results)} total")
sys.exit(1 if failed else 0)
