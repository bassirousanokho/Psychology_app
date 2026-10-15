import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <SignUp unsafeMetadata={{ role: "practitioner" }} />
    </div>
  );
}
