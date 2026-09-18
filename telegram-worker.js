const MAX_FILE_SIZE = 10 * 1024 * 1024;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "";
  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : (origin === allowed ? origin : allowed),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request, env) }
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (request.method === "GET") {
      return json(request, env, { ok: true, service: "Amulet Audit Telegram API" });
    }

    if (request.method !== "POST") {
      return json(request, env, { ok: false, error: "Method not allowed" }, 405);
    }

    const origin = request.headers.get("Origin") || "";
    if (env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== "*" && origin !== env.ALLOWED_ORIGIN) {
      return json(request, env, { ok: false, error: "Origin not allowed" }, 403);
    }

    if (!env.BOT_TOKEN || !env.CHAT_ID) {
      return json(request, env, { ok: false, error: "Server sozlanmagan" }, 500);
    }

    try {
      const form = await request.formData();
      const file = form.get("questionnaire");
      const name = String(form.get("name") || "").trim();
      const phone = String(form.get("phone") || "").trim();
      const email = String(form.get("email") || "").trim();

      if (name.length < 2 || phone.length < 7 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(request, env, { ok: false, error: "Majburiy maydonlarni tekshiring" }, 422);
      }

      if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || file.size < 1 || file.size > MAX_FILE_SIZE) {
        return json(request, env, { ok: false, error: "Faqat 10 MB gacha .xlsx fayl qabul qilinadi" }, 422);
      }

      const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
        return json(request, env, { ok: false, error: "Bu haqiqiy .xlsx fayl emas" }, 422);
      }

      const lines = [
        "🆕 <b>Yangi zayavka — Amulet Audit</b>", "",
        `👤 <b>Ism:</b> ${escapeHtml(name)}`,
        `📞 <b>Telefon:</b> ${escapeHtml(phone)}`,
        `✉️ <b>Email:</b> ${escapeHtml(email)}`,
        `🧾 <b>Xizmat:</b> ${escapeHtml(form.get("serviceLabel") || "—")}`
      ];
      if (form.get("specialist")) lines.push(`🧑‍💼 <b>Mutaxassis:</b> ${escapeHtml(form.get("specialist"))}`);
      if (form.get("message")) lines.push(`💬 <b>Xabar:</b> ${escapeHtml(form.get("message"))}`);
      lines.push(`🌐 <b>Til:</b> ${escapeHtml(form.get("langLabel") || "—")}`);
      lines.push(`🕒 <b>Vaqt:</b> ${escapeHtml(form.get("timestamp") || new Date().toISOString())}`);

      const telegramBody = new FormData();
      telegramBody.set("chat_id", env.CHAT_ID);
      telegramBody.set("caption", lines.join("\n"));
      telegramBody.set("parse_mode", "HTML");
      telegramBody.set("document", new File([file], file.name, { type: XLSX_MIME }));

      const telegramResponse = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, {
        method: "POST",
        body: telegramBody
      });
      const telegramResult = await telegramResponse.json().catch(() => ({}));
      if (!telegramResponse.ok || telegramResult.ok !== true) {
        return json(request, env, { ok: false, error: "Telegramga yuborishda xatolik" }, 502);
      }

      return json(request, env, { ok: true });
    } catch (error) {
      return json(request, env, { ok: false, error: "Server xatosi" }, 500);
    }
  }
};
