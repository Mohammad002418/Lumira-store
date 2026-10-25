/* Lumira shared client: API access, header/footer, cart badge, product cards, toasts. */
(function () {
  "use strict";

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);
  }
  async function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    var res, data = {};
    try { res = await fetch(path, init); } catch (e) { throw Object.assign(new Error("Network error. Check your connection."), { status: 0 }); }
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) {
      var err = new Error(data.error || "Request failed (" + res.status + ")");
      err.status = res.status; err.fields = data.fields || {};
      throw err;
    }
    return data;
  }

  // ----- toast (aria-live) -----
  function toast(message, kind) {
    var box = document.getElementById("toast");
    if (!box) return;
    box.className = "toast show " + (kind || "ok");
    box.textContent = message;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.className = "toast"; }, 3200);
  }

  // ----- cart state (server-side, per browser session cookie) -----
  var cart = { items: [], count: 0, subtotal: 0 };
  async function refreshCart() {
    try { cart = await api("/api/cart"); } catch (e) { /* keep last known */ }
    updateBadge();
    window.dispatchEvent(new CustomEvent("lumira-cart-change", { detail: cart }));
    return cart;
  }
  function updateBadge() {
    var b = document.getElementById("cart-count");
    if (b) b.textContent = cart.count || 0;
    var link = document.getElementById("cart-link");
    if (link) link.setAttribute("aria-label", "Cart, " + (cart.count || 0) + " items");
  }
  async function setCart(productId, mode, qty) {
    try {
      cart = await api("/api/cart", { method: "POST", body: { productId: productId, mode: mode, qty: qty } });
      updateBadge();
      window.dispatchEvent(new CustomEvent("lumira-cart-change", { detail: cart }));
      return cart;
    } catch (e) {
      if (e.status === 409 && e.data) { cart = e.data; updateBadge(); }
      throw e;
    }
  }
  async function removeFromCart(productId) {
    cart = await api("/api/cart/" + encodeURIComponent(productId), { method: "DELETE" });
    updateBadge();
    window.dispatchEvent(new CustomEvent("lumira-cart-change", { detail: cart }));
    return cart;
  }

  // ----- products (cached per page load) -----
  var productsPromise = null;
  function getProducts() {
    if (!productsPromise) productsPromise = api("/api/products").then(function (d) { return d; });
    return productsPromise;
  }

  // ----- header / footer -----
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  var ICON_CART = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>';

  var SUPPORT_EMAIL = "noorsmam99@gmail.com";

  function headerHtml(active) {
    var links = [["index.html", "Home"], ["products.html", "Products"], ["index.html#categories", "Categories"], ["about.html", "About us"], ["contact.html", "Contact"]];
    var nav = links.map(function (l) {
      var cur = l[0] === active ? ' aria-current="page"' : "";
      return '<a href="' + l[0] + '"' + cur + ">" + l[1] + "</a>";
    }).join("");
    return '<header class="site-header"><div class="container header-row">' +
      '<a class="brand" href="index.html" aria-label="Lumira home"><img src="brand/lumira-logo.png" alt="Lumira logo" width="164" height="115"></a>' +
      '<form class="search" role="search" action="products.html" method="get">' + ICON_SEARCH +
      '<label class="sr-only" for="q">Search products</label>' +
      '<input id="q" name="q" type="search" maxlength="80" placeholder="Search phones, laptops, audio…" autocomplete="off"></form>' +
      '<nav id="site-nav" class="nav" aria-label="Main">' + nav + "</nav>" +
      '<div class="header-actions">' +
      '<a id="cart-link" class="cart-pill" href="cart.html" aria-label="Cart, 0 items" title="Cart">' + ICON_CART +
      '<span class="label">Cart</span><span id="cart-count" class="badge">0</span></a>' +
      '<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><span class="bars" aria-hidden="true"></span><span class="sr-only">Menu</span></button>' +
      "</div></div></header>";
  }

  function footerHtml() {
    var year = new Date().getFullYear();
    return '<footer class="site-footer"><div class="container">' +
      '<div class="foot-grid">' +
        '<div class="foot-brand"><img src="brand/lumira-logo-light.png" alt="Lumira" width="120" height="84">' +
          '<p>Technology that moves with you. Smartphones, laptops, smartwatches, audio and accessories, chosen with care.</p>' +
          '<a class="foot-mail" href="mailto:' + SUPPORT_EMAIL + '">' + SUPPORT_EMAIL + '</a></div>' +
        '<nav aria-label="Shop"><h3>Shop</h3><a href="products.html">All products</a><a href="category-smartphones.html">Smartphones</a><a href="category-laptops.html">Laptops &amp; computers</a><a href="category-smartwatches.html">Smartwatches</a><a href="category-audio.html">Headphones &amp; audio</a><a href="category-accessories.html">Accessories &amp; chargers</a></nav>' +
        '<nav aria-label="Help"><h3>Help</h3><a href="contact.html">Contact us</a><a href="shipping.html">Shipping</a><a href="returns.html">Returns</a><a href="warranty.html">Warranty</a><a href="cart.html">Your cart</a></nav>' +
        '<nav aria-label="Company"><h3>Company</h3><a href="about.html">About us</a><a href="privacy.html">Privacy policy</a><a href="terms.html">Terms &amp; conditions</a></nav>' +
      "</div>" +
      '<div class="legal"><p>© ' + year + ' Lumira. All rights reserved.</p>' +
        '<p><a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a> · <a href="shipping.html">Shipping</a> · <a href="returns.html">Returns</a></p></div>' +
      "</div></footer>";
  }

  function mount(active) {
    var h = document.getElementById("site-header");
    if (h) h.outerHTML = headerHtml(active);
    var f = document.getElementById("site-footer");
    if (f) f.outerHTML = footerHtml();
    if (!document.getElementById("toast")) {
      var t = document.createElement("div");
      t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite");
      document.body.appendChild(t);
    }
    var toggle = document.querySelector(".menu-toggle");
    if (toggle) toggle.addEventListener("click", function () {
      var nav = document.getElementById("site-nav");
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    var qEl = document.getElementById("q");
    if (qEl) { var s = new URLSearchParams(location.search).get("q"); if (s) qEl.value = s; }
    refreshCart();
  }

  // Product card: the whole image/name area links to the product page; "Add to Cart" is a separate control.
  function productCard(p) {
    var bgClass = p.bg === "dark" ? "dark" : "is-light";
    var blend = p.bg === "dark" ? "blend-screen" : "blend-multiply";
    var url = "product.html?id=" + encodeURIComponent(p.id);
    var avail = p.stock > 0 ? '<span class="tag">In stock</span>' : '<span class="tag">Out of stock</span>';
    return '<article class="card">' +
      '<a class="card-link" href="' + url + '" aria-label="' + esc(p.name) + ' details">' +
        '<span class="card-media ' + bgClass + '"><img class="' + blend + '" src="products/' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" width="400" height="400"></span>' +
        '<span class="card-body"><span class="meta">' + esc(p.brand) + '</span>' +
        '<span class="card-title">' + esc(p.name) + '</span>' +
        '<span class="price">' + fmt(p.price) + '</span>' + avail +
        '<span class="spec">' + esc((p.specs && p.specs[0]) || "") + '</span></span>' +
      '</a>' +
      '<div class="card-actions" style="padding:0 1.1rem 1.1rem">' +
        '<button class="btn btn-primary" type="button" data-add="' + esc(p.id) + '"' + (p.stock > 0 ? "" : " disabled") + ">Add to Cart</button>" +
        '<a class="btn btn-ghost" href="' + url + '">Details</a></div>' +
    "</article>";
  }

  document.addEventListener("click", async function (e) {
    var btn = e.target.closest && e.target.closest("[data-add]");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
      await setCart(btn.getAttribute("data-add"), "add", 1);
      toast("Added to your cart.", "ok");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      btn.disabled = false;
    }
  });

  window.Lumira = {
    esc: esc, fmt: fmt, api: api, toast: toast,
    getProducts: getProducts, productCard: productCard,
    refreshCart: refreshCart, setCart: setCart, removeFromCart: removeFromCart,
    getCart: function () { return cart; }, mount: mount
  };
})();
