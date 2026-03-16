import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

interface SendEmailResult {
  success: true;
  id: string;
}

interface SendEmailError {
  success: false;
  error: string;
}

export async function sendEmail(
  params: SendEmailParams
): Promise<SendEmailResult | SendEmailError> {
  const { data, error } = await resend.emails.send({
    from: "Storybound <onboarding@resend.dev>",
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Failed to send email.",
    };
  }

  return { success: true, id: data.id };
}
