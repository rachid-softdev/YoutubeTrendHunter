import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? "TrendHunter <alerts@trendhunter.app>";

export async function sendWelcomeEmail(to: string, userName: string): Promise<void> {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Bienvenue sur TrendHunter !",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0F0F0F;color:#F1F1F1">
          <div style="font-size:24px;font-weight:700;color:#FF0000;margin-bottom:16px">TrendHunter</div>
          <h1 style="font-size:28px;margin-bottom:8px">Bienvenue, ${userName} !</h1>
          <p style="color:#AAAAAA;font-size:16px;line-height:1.6">
            Merci d'avoir rejoint TrendHunter. Vous faites maintenant partie des créateurs qui ont un temps d'avance sur l'algorithme YouTube.
          </p>
          <p style="color:#AAAAAA;font-size:16px;line-height:1.6">
            Commencez dès maintenant à explorer les tendances émergentes dans votre niche.
          </p>
          <a href="${process.env.NEXTAUTH_URL}/dashboard" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF0000;color:#fff;font-weight:700;text-decoration:none;border-radius:4px">
            ACCÉDER AU DASHBOARD
          </a>
          <p style="color:#717171;font-size:12px;margin-top:32px;border-top:1px solid #3D3D3D;padding-top:16px">
            TrendHunter — Pour les créateurs, par des créateurs.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send welcome email:", err);
  }
}

export async function sendAlertEmail(
  to: string,
  nicheName: string,
  trends: { title: string; score: number }[],
): Promise<void> {
  const trendsHtml = trends
    .map(
      (t) =>
        `<li style="margin-bottom:8px;color:#F1F1F1"><strong>${t.title}</strong> — Score: ${t.score}/100</li>`,
    )
    .join("");

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `🔴 Alerte TrendHunter — ${nicheName}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0F0F0F;color:#F1F1F1">
          <div style="font-size:24px;font-weight:700;color:#FF0000;margin-bottom:16px">TrendHunter</div>
          <h1 style="font-size:22px;margin-bottom:4px">Alerte : ${nicheName}</h1>
          <p style="color:#AAAAAA;font-size:14px;margin-bottom:16px">De nouvelles tendances ont été détectées dans votre niche.</p>
          <ul style="padding-left:20px;color:#AAAAAA">${trendsHtml}</ul>
          <a href="${process.env.NEXTAUTH_URL}/dashboard" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF0000;color:#fff;font-weight:700;text-decoration:none;border-radius:4px">
            VOIR TOUTES LES TENDANCES
          </a>
          <p style="color:#717171;font-size:12px;margin-top:32px;border-top:1px solid #3D3D3D;padding-top:16px">
            Vous recevez cet email car vous avez activé les alertes TrendHunter. <a href="${process.env.NEXTAUTH_URL}/alerts" style="color:#717171">Gérer mes alertes</a>.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send alert email:", err);
  }
}

export async function sendDigestEmail(
  to: string,
  nicheName: string,
  trends: { title: string; score: number; status: string }[],
): Promise<void> {
  const trendsHtml = trends
    .map(
      (t) =>
        `<li style="margin-bottom:8px;color:#F1F1F1"><strong>${t.title}</strong> — ${t.score}/100 — <span style="color:#717171">${t.status}</span></li>`,
    )
    .join("");

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `📊 Digest TrendHunter — ${nicheName}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0F0F0F;color:#F1F1F1">
          <div style="font-size:24px;font-weight:700;color:#FF0000;margin-bottom:16px">TrendHunter</div>
          <h1 style="font-size:22px;margin-bottom:4px">Digest quotidien : ${nicheName}</h1>
          <p style="color:#AAAAAA;font-size:14px;margin-bottom:16px">Voici les tendances du jour.</p>
          <ul style="padding-left:20px;color:#AAAAAA">${trendsHtml}</ul>
          <a href="${process.env.NEXTAUTH_URL}/dashboard" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF0000;color:#fff;font-weight:700;text-decoration:none;border-radius:4px">
            VOIR LE DASHBOARD
          </a>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send digest email:", err);
  }
}
