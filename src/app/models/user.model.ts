export interface User {
  id: string;
  email: string;
  token?: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  user: User | null;
}
