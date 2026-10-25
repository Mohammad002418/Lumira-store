(function () {
  "use strict";
  var L = window.Lumira;
  L.mount("cart.html");
  var box = document.getElementById("lines");

  function render(c) {
    document.getElementById("empty").hidden = c.items.length > 0;
    document.getElementById("cart-body").hidden = c.items.length === 0;
    box.innerHTML = c.items.map(function (i) {
      var mediaStyle = i.bg === "light" ? "background:#fff" : "";
      return '<div class="line">' +
        '<img src="products/' + L.esc(i.image) + '" alt="' + L.esc(i.name) + '" width="96" height="96" style="' + mediaStyle + '">' +
        '<div><h3 style="font-size:1rem"><a href="product.html?id=' + encodeURIComponent(i.productId) + '" style="color:inherit">' + L.esc(i.name) + '</a></h3>' +
          '<div class="qty" role="group" aria-label="Quantity for ' + L.esc(i.name) + '">' +
          '<button type="button" data-dec="' + L.esc(i.productId) + '" aria-label="Decrease quantity">−</button><span aria-live="polite">' + i.qty + '</span>' +
          '<button type="button" data-inc="' + L.esc(i.productId) + '" aria-label="Increase quantity"' + (i.qty >= i.stock ? ' disabled' : '') + '>+</button></div>' +
          '<div><button class="remove" type="button" data-rm="' + L.esc(i.productId) + '">Remove</button></div></div>' +
        '<div class="price-md">' + L.fmt(i.lineTotal) + '</div>' +
        '</div>';
    }).join("");
    document.getElementById("sub").textContent = L.fmt(c.subtotal);
    document.getElementById("total").textContent = L.fmt(c.subtotal);
  }

  window.addEventListener("lumira-cart-change", function (e) { render(e.detail); });
  document.addEventListener("click", async function (e) {
    var t = e.target;
    try {
      if (t.dataset.inc) { var a = findLine(t.dataset.inc); await L.setCart(t.dataset.inc, "set", Math.min(20, a.qty + 1)); }
      if (t.dataset.dec) { var b = findLine(t.dataset.dec); await L.setCart(t.dataset.dec, "set", b.qty - 1); }
      if (t.dataset.rm) await L.removeFromCart(t.dataset.rm);
    } catch (err) { L.toast(err.message, "err"); }
  });
  function findLine(id) {
    return L.getCart().items.find(function (i) { return i.productId === id; }) || { qty: 1 };
  }
  L.refreshCart().then(render);
})();
