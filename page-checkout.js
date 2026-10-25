(function () {
  "use strict";
  var L = window.Lumira;
  L.mount("cart.html");
  var form = document.getElementById("form");
  var FIELDS = ["name", "email", "phone", "street", "city", "postal", "country"];

  function setError(field, msg) {
    var input = form.elements[field];
    var err = form.querySelector('[data-err="' + field + '"]');
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (err) err.textContent = msg || "";
  }
  function clearErrors() { FIELDS.concat(["payment"]).forEach(function (f) { setError(f, ""); }); }

  function renderSummary(c) {
    if (!c.items.length) {
      form.hidden = true;
      document.querySelector(".checkout-layout").innerHTML =
        '<div class="empty" style="grid-column:1/-1"><h2>Your cart is empty</h2><a class="btn btn-primary" href="products.html">Browse products</a></div>';
      return;
    }
    document.getElementById("items").innerHTML = c.items.map(function (i) {
      return '<div class="summary-row"><span>' + L.esc(i.name) + ' × ' + i.qty + '</span><span>' + L.fmt(i.lineTotal) + '</span></div>';
    }).join("");
    document.getElementById("sub").textContent = L.fmt(c.subtotal);
    document.getElementById("total").textContent = L.fmt(c.subtotal);
  }
  L.refreshCart().then(renderSummary);

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearErrors();
    var status = document.getElementById("status");
    status.className = "status"; status.textContent = "";
    var body = {};
    FIELDS.forEach(function (f) { body[f] = form.elements[f].value; });
    body.payment = form.elements.pay.value;
    var btn = document.getElementById("place");
    btn.disabled = true; btn.textContent = "Placing order…";
    try {
      var r = await L.api("/api/orders", { method: "POST", body: body });
      form.hidden = true;
      document.querySelector(".checkout-layout").innerHTML =
        '<section class="panel" style="grid-column:1/-1" role="status"><h2>Thank you — order received</h2>' +
        '<p>Your order reference is <strong>' + L.esc(r.reference) + '</strong>. Total: <strong>' + L.fmt(r.total) + '</strong>.</p>' +
        '<p>Pay on delivery. No payment was taken online. The store will confirm your order by phone or email.</p>' +
        '<a class="btn btn-primary" href="products.html">Continue shopping</a></section>';
      L.refreshCart();
    } catch (err) {
      Object.keys(err.fields || {}).forEach(function (f) { setError(f, err.fields[f]); });
      status.className = "status show err";
      status.textContent = err.message;
      if (err.status === 409) L.refreshCart();
    } finally {
      btn.disabled = false; btn.textContent = "Place order";
    }
  });
})();
