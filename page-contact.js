(function () {
  "use strict";
  var L = window.Lumira;
  L.mount("contact.html");
  var form = document.getElementById("contact-form");
  var FIELDS = ["name", "email", "message"];

  function setErr(field, msg) {
    var input = form.elements[field];
    var err = form.querySelector('[data-err="' + field + '"]');
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (err) err.textContent = msg || "";
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    FIELDS.forEach(function (f) { setErr(f, ""); });
    var msg = document.getElementById("cmsg");
    msg.className = ""; msg.textContent = "";
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    var body = { name: form.elements.name.value, email: form.elements.email.value, message: form.elements.message.value };
    try {
      var r = await L.api("/api/contact", { method: "POST", body: body });
      msg.className = "ok-text"; msg.textContent = r.message;
      form.reset();
    } catch (err) {
      Object.keys(err.fields || {}).forEach(function (f) { setErr(f, err.fields[f]); });
      msg.className = "err-text"; msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
})();
