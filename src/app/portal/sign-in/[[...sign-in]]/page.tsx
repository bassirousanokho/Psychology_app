import { SignIn } from "@clerk/nextjs";

export default function PatientSignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      {/* Accounts created from here (e.g. Google sign-in) are patients, not practitioners */}
      <SignIn fallbackRedirectUrl="/portal/dashboard" unsafeMetadata={{ role: "patient" }} />
    </div>
  );
}
