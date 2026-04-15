export function AuthBackdrop({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8 sm:py-14">
      <div
        className="absolute inset-0 -z-20 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/brand/login-bg.png')" }}
        aria-hidden
      />
      <div className="absolute inset-0 -z-10 bg-slate-950/58" aria-hidden />
      <div className="absolute inset-0 -z-10 backdrop-blur-[2px]" aria-hidden />
      <div className="saas-shell flex min-h-[calc(100vh-4rem)] items-center justify-center">{children}</div>
    </div>
  );
}

