(function () {
  "use strict";
  var L = window.Lumira;
  var body = document.body;
  var lockedCat = body.getAttribute("data-category") || "";
  L.mount(body.getAttribute("data-page"));
  var CATS = [
    { id: "smartphones", name: "Smartphones" }, { id: "laptops", name: "Laptops & Computers" },
    { id: "smartwatches", name: "Smartwatches" }, { id: "audio", name: "Headphones & Audio" },
    { id: "accessories", name: "Accessories & Chargers" }
  ];
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var DEFAULT = { q: params.get("q") || "", cat: lockedCat || params.get("cat") || "", brand: "", max: 2000, stock: false, sort: "featured" };
  var state = Object.assign({}, DEFAULT);
  var all = [];

  function ready(list) {
    all = list;
    var brands = list.map(function (p) { return p.brand; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (!lockedCat) {
      $("f-cat").innerHTML = CATS.map(function (c) {
        return '<label><input type="radio" name="cat" value="' + c.id + '"' + (state.cat === c.id ? " checked" : "") + "> " + L.esc(c.name) + "</label>";
      }).join("") + '<label><input type="radio" name="cat" value=""' + (!state.cat ? " checked" : "") + "> All categories</label>";
    } else {
      $("f-cat-group").hidden = true;
    }
    $("f-brand").innerHTML = brands.map(function (b) {
      return '<label><input type="radio" name="brand" value="' + L.esc(b) + '"> ' + L.esc(b) + "</label>";
    }).join("") + '<label><input type="radio" name="brand" value="" checked> All brands</label>';
    $("f-q").value = state.q;
    apply();
  }

  function apply() {
    var q = state.q.trim().toLowerCase();
    var list = all.filter(function (p) {
      if (state.cat && p.category !== state.cat) return false;
      if (state.brand && p.brand !== state.brand) return false;
      if (p.price > state.max) return false;
      if (state.stock && p.stock <= 0) return false;
      if (q && (p.name + " " + p.brand + " " + p.category + " " + (p.keywords || "")).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    if (state.sort === "price-asc") list.sort(function (a, b) { return a.price - b.price; });
    else if (state.sort === "price-desc") list.sort(function (a, b) { return b.price - a.price; });
    else if (state.sort === "name") list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else list.sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });
    $("results").innerHTML = list.map(L.productCard).join("");
    $("count").textContent = list.length + " product" + (list.length === 1 ? "" : "s");
    $("empty").hidden = list.length > 0;
    var c = CATS.find(function (x) { return x.id === (lockedCat || state.cat); });
    $("page-title").textContent = c ? c.name : "All products";
    $("f-price-out").textContent = L.fmt(state.max);
    if (state.q) history.replaceState(null, "", location.pathname + "?" + new URLSearchParams(state.q ? { q: state.q } : {}).toString());
  }
  function reset() {
    state = Object.assign({}, DEFAULT, { q: "", brand: "", max: 2000, stock: false, sort: "featured", cat: lockedCat });
    $("f-q").value = ""; $("f-sort").value = "featured"; $("f-price").value = 2000; $("f-stock").checked = false;
    document.querySelectorAll('input[name="cat"]').forEach(function (r) { r.checked = r.value === ""; });
    document.querySelectorAll('input[name="brand"]').forEach(function (r) { r.checked = r.value === ""; });
    apply();
  }

  $("f-q").addEventListener("input", function (e) { state.q = e.target.value.slice(0, 80); apply(); });
  $("f-sort").addEventListener("change", function (e) { state.sort = e.target.value; apply(); });
  $("f-price").addEventListener("input", function (e) { state.max = +e.target.value; apply(); });
  $("f-stock").addEventListener("change", function (e) { state.stock = e.target.checked; apply(); });
  document.addEventListener("change", function (e) {
    if (e.target.name === "cat") { state.cat = e.target.value; apply(); }
    if (e.target.name === "brand") { state.brand = e.target.value; apply(); }
  });
  $("f-reset").addEventListener("click", reset);
  $("f-reset2").addEventListener("click", reset);

  $("results").innerHTML = '<p>Loading products…</p>';
  L.getProducts().then(function (d) { ready(d.products); }).catch(function (e) {
    $("results").innerHTML = '<p role="alert">Could not load products: ' + L.esc(e.message) + '</p>';
  });
})();
