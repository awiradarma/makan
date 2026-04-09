import { useAuth } from '@/contexts/AuthContext'

export default function Login() {
  const { signIn } = useAuth()

  return (
    <div className="login-page">
      <div className="login-page__brand">🍜</div>
      <h1 className="login-page__title">Family Food Vault</h1>
      <p className="login-page__subtitle">
        Track meals, manage rotations, and never forget your favorite orders.
      </p>
      <button className="login-page__btn" onClick={signIn}>
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt="Google"
        />
        Sign in with Google
      </button>
    </div>
  )
}
