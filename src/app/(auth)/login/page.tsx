import { signIn } from "@/lib/auth"

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-2xl">
        <div>
          <h1 className="text-2xl font-semibold">Connexion</h1>
          <p className="text-sm text-gray-500 mt-1">
            Continuez avec votre compte Google
          </p>
        </div>
        <form
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: "/dashboard" })
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.163 1.196-.653 2.212-1.388 2.835v2.345h2.453c1.284-2.375 2.453-4.975 2.453-7.835z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.802 5.956-2.18l-2.453-2.345c-.802.537-1.828.857-3.503.857-2.688 0-4.962-1.818-5.78-4.253H.919v2.573C2.421 15.462 5.493 18 9 18z"/>
              <path fill="#FBBC05" d="M3.22 10.672c1.055-.002 2.006.361 2.756 1.059v-2.573H.919C.303 11.893 0 13.093 0 14.444c0 1.35.303 2.55.919 3.556l2.3-1.544-.001-2.784z"/>
              <path fill="#EA4335" d="M9 3.822c1.467 0 2.784.503 3.823 1.492l2.254-2.254C13.512 1.478 11.431 0 9 0 5.493 0 2.421 2.538.919 5.556L3.22 6.1c.818-2.435 3.092-4.278 5.78-4.278z"/>
            </svg>
            Continuer avec Google
          </button>
        </form>
      </div>
    </div>
  )
}