import { AuthPageShell } from "@/components/auth-page-shell";
import { UpdatePasswordForm } from "@/components/update-password-form";

export default function Page() {
  return (
    <AuthPageShell
      eyebrow="Secure Reset"
      title="Lock in a new key."
      description="Choose a fresh password and keep your account ready for the next live session."
      stats={[
        ["New", "Password"],
        ["Secure", "Session"],
        ["Ready", "Access"],
      ]}
      feed={["Reset active", "Session secure", "Return ready"]}
      actionHref="/auth/login"
      actionLabel="Login"
    >
      <UpdatePasswordForm />
    </AuthPageShell>
  );
}
