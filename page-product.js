(function () {
  "use strict";
  var L = window.Lumira;
  L.mount("products.html");
  var id = new URLSearchParams(location.search).get("id") || "";
  var root = document.getElementById("product-root");

  function notFound(msg) {
    root.innerHTML = '<div class="empty"><h2>' + L.esc(msg) + '</h2><p>This product may have been removed.</p>' +
      '<a class="btn btn-primary" href="products.html">Back to products</a></div>';
  }
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return notFound("Product not found");

  L.api("/api/products/" + encodeURIComponent(id)).then(function (data) {
    var p = data.product;
    document.title = p.name + " · Lumira";
    document.getElementById("crumb").textContent = p.name;
    var catName = { smartphones: "Smartphones", laptops: "Laptops", smartwatches: "Smartwatches", audio: "Audio", accessories: "Accessories" }[p.category] || "Products";
    document.getElementById("crumb-cat").href = "category-" + p.category + ".html";
    document.getElementById("crumb-cat").textContent = catName;
    var bgClass = p.bg === "dark" ? "dark" : "";
    var blend = p.bg === "dark" ? "blend-screen" : "blend-multiply";
    var mediaStyle = p.bg === "light" ? ' style="background:#fff"' : "";
    var rows = p.specs.map(function (s) { return '<tr><td colspan="2">' + L.esc(s) + "</td></tr>"; }).join("");
    root.innerHTML =
      '<div class="detail">' +
        '<div class="detail-media card-media ' + bgClass + '"' + mediaStyle + '><img class="' + blend + '" src="products/' + L.esc(p.image) + '" alt="' + L.esc(p.name) + '" width="600" height="600"></div>' +
        '<div>' +
          '<p class="meta" style="color:var(--ink-muted);margin:0">' + L.esc(p.brand) + '</p>' +
          '<h1>' + L.esc(p.name) + '</h1>' +
          '<p class="price-lg">' + L.fmt(p.price) + '</p>' +
          '<p>' + (p.stock > 0 ? '<span class="tag">In stock</span>' : '<span class="tag">Out of stock</span>') + '</p>' +
          '<h2 style="font-size:1.1rem;margin-top:1rem">Key specifications</h2>' +
          '<table class="specs"><tbody>' + rows + '</tbody></table>' +
          '<p><strong>Colours:</strong> ' + L.esc(p.colors.join(", ")) + '</p>' +
          '<div class="buy-row">' +
            '<div class="qty" role="group" aria-label="Quantity"><button type="button" id="dec" aria-label="Decrease quantity">−</button><span id="qty" aria-live="polite">1</span><button type="button" id="inc" aria-label="Increase quantity">+</button></div>' +
            '<button class="btn btn-primary" type="button" id="add"' + (p.stock > 0 ? '' : ' disabled') + '>Add to Cart</button>' +
          '</div>' +
          '<div class="notice">Warranty, shipping and return details for every Lumira product are explained on our <a href="warranty.html">warranty</a>, <a href="shipping.html">shipping</a> and <a href="returns.html">returns</a> pages.</div>' +
        '</div>' +
      '</div>';

    var qty = 1;
    var qEl = document.getElementById("qty");
    document.getElementById("dec").addEventListener("click", function () { qty = Math.max(1, qty - 1); qEl.textContent = qty; });
    document.getElementById("inc").addEventListener("click", function () { qty = Math.min(Math.max(1, p.stock), Math.min(20, qty + 1)); qEl.textContent = qty; });
    document.getElementById("add").addEventListener("click", async function () {
      var btn = this; btn.disabled = true;
      try {
        await L.setCart(p.id, "add", qty);
        L.toast(qty + " × " + p.name + " added to your cart.", "ok");
      } catch (e) {
        L.toast(e.message, "err");
      } finally { btn.disabled = p.stock <= 0; }
    });

    L.getProducts().then(function (all) {
      var related = all.products.filter(function (x) { return x.category === p.category && x.id !== p.id; }).slice(0, 4);
      document.getElementById("related-grid").innerHTML = related.map(L.productCard).join("") || "<p>No related products yet.</p>";
    });
  }).catch(function (e) {
    notFound(e.status === 404 ? "Product not found" : "Could not load product");
  });
})();
