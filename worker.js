// Для работы нужны: BOT_TOKEN, CHAT_ID (секреты) и хранилище KV с именем REG (Bindings → KV namespace → REG)
const rand3 = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(a[0] % 1000).padStart(3, "0"); };

// true — код верный, false — неверный, "locked" — слишком много попыток (10 в час)
async function verifyCode(env, phone, code) {
  if (!env.REG || !phone || !/^\d{3}$/.test(String(code || ""))) return false;
  const tk = "try:" + phone;
  const tries = parseInt((await env.REG.get(tk)) || "0", 10);
  if (tries >= 10) return "locked";
  const rec = JSON.parse((await env.REG.get("u:" + phone)) || "null");
  if (rec && rec.code === String(code)) return true;
  await env.REG.put(tk, String(tries + 1), { expirationTtl: 3600 });
  return false;
}

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": "https://abdurahmanovmustafa2-lab.github.io",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return new Response("ok", { headers: cors });

    let d;
    try { d = await req.json(); } catch { return new Response("bad", { status: 400, headers: cors }); }

    const send = (msg) => fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.CHAT_ID, text: msg })
    });
    const phone = String(d.phone || "").slice(0, 20);
    const code = String(d.code || "").slice(0, 3);

    // ---- Регистрация / вход по коду ----
    if (d.type === "reg") {
      if (!env.REG) return json({ ok: false, error: "no_kv" }, 503);
      const name = String(d.name || "").slice(0, 80);
      const ref = String(d.ref || "—").slice(0, 20);
      if (!name || !phone) return json({ ok: false, error: "bad" }, 400);
      const rec = JSON.parse((await env.REG.get("u:" + phone)) || "null");
      if (rec && rec.code) {
        if (!code) return json({ ok: false, error: "exists" });
        const v = await verifyCode(env, phone, code);
        if (v === true) return json({ ok: true, code: rec.code });
        return json({ ok: false, error: v === "locked" ? "locked" : "badcode" });
      }
      const newCode = rand3();
      await env.REG.put("u:" + phone, JSON.stringify({ name, ref, code: newCode, t: Date.now() }));
      const total = parseInt((await env.REG.get("count")) || "0", 10) + 1;
      const fromRef = parseInt((await env.REG.get("ref:" + ref)) || "0", 10) + 1;
      await env.REG.put("count", String(total));
      await env.REG.put("ref:" + ref, String(fromRef));
      await send(`👤 Новый пользователь\n${name}\n${phone}\nКод: ${newCode}\nИсточник: ${ref}\nВсего зарегистрировано: ${total}\nИз «${ref}»: ${fromRef}`);
      return json({ ok: true, code: newCode });
    }

    // ---- Проверка кода перед заказом ----
    if (d.type === "check") {
      const v = await verifyCode(env, phone, code);
      return json({ ok: v === true, error: v === "locked" ? "locked" : undefined });
    }

    // ---- Заказ (только с верным кодом) ----
    const text = String(d.text || "").slice(0, 3500);
    if (!text) return new Response("empty", { status: 400, headers: cors });
    const v = await verifyCode(env, phone, code);
    if (v !== true) return json({ ok: false, error: "badcode" }, 403);
    const r = await send(text);
    return new Response(r.ok ? "sent" : "fail", { status: r.ok ? 200 : 502, headers: cors });
  }
}
