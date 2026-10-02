import {
  ActivityItem,
  AdminAnalytics,
  ApiError,
  AuthResponse,
  AuditLogItem,
  Certificate,
  CertificateTemplate,
  CreateCertificateData,
  DashboardStats,
  IssuanceTrendPoint,
  PaginatedResponse,
  CertificateExportFilters,
  StatusDistribution,
  User,
  UserRole,
  VerificationResult,
  LoginCredentials,
  RegisterData,
  ProfileUpdateData,
  DailyVerificationStats,
  TotalCertificatesStats,
  TotalActiveUsersStats,
  IssuerStats,
  PaginatedActivityLog,
  CertificateTransfer,
  InitiateTransferDto,
  ApproveTransferDto,
  RejectTransferDto,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
} from "../types";
import { tokenStorage, notifyTokenRefreshed } from '../tokens';
import { apiClient, apiClientRaw, API_URL, dummyData, simulateDelay, handleError } from '../client';

// ==================== AUTHENTICATION ====================

export const loginApi = async (
  credentials: LoginCredentials,
): Promise<AuthResponse> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    const user = dummyData.users.find((u) => u.email === credentials.email);
    if (user && credentials.password === "password123") {
      const response: AuthResponse = {
        user,
        accessToken: "dummy-access-token",
        refreshToken: "dummy-refresh-token",
      };
      tokenStorage.setAccessToken(response.accessToken);
      return response;
    }
    throw new Error("Invalid credentials");
  }

  try {
    const response = await apiClient<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
      skipAuth: true,
    });
    tokenStorage.setAccessToken(response.accessToken);
    return response;
  } catch (error) {
    return handleError(error, "loginApi");
  }
};

export const registerApi = async (
  data: RegisterData,
): Promise<AuthResponse> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    const newUser: User = {
      id: `user-${Date.now()}`,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: UserRole.USER,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dummyData.users.push(newUser);
    const response: AuthResponse = {
      user: newUser,
      accessToken: "dummy-access-token",
      refreshToken: "dummy-refresh-token",
    };
    tokenStorage.setAccessToken(response.accessToken);
    return response;
  }

  try {
    const response = await apiClient<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      }),
      skipAuth: true,
    });
    // Registration requires email verification before login is allowed.
    // Store access token so the UI can show the "check your email" state.
    if (response.accessToken) {
      tokenStorage.setAccessToken(response.accessToken);
    }
    return response;
  } catch (error) {
    return handleError(error, "registerApi");
  }
};

export const authApi = {
  login: loginApi,
  register: registerApi,
  // Shares the de-duplicated/cooldown-guarded refresh so AuthContext rehydration
  // and apiClient's 401 handler coalesce onto a single /auth/refresh request.
  refresh: (): Promise<AuthResponse> => refreshTokens(),
  logout: async (): Promise<void> => {
    try {
      if (!(import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
        const accessToken = tokenStorage.getAccessToken();
        await apiClient("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ accessToken: accessToken ?? '' }),
        });
      }
    } finally {
      tokenStorage.clearTokens();
    }
  },
  forgotPassword: async (data: ForgotPasswordRequest): Promise<{ message: string }> => {
    return apiClient("/users/forgot-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  resetPassword: async (data: ResetPasswordRequest): Promise<{ message: string }> => {
    return apiClient("/users/reset-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  verifyEmail: async (
    data: VerifyEmailRequest,
  ): Promise<{ message: string }> => {
    return apiClient("/users/verify-email", {
      method: "POST",
      body: JSON.stringify(data),
      skipAuth: true,
    });
  },
  resendVerification: async (email: string): Promise<{ message: string }> => {
    return apiClient("/users/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
      skipAuth: true,
    });
  },
};

export const login = loginApi;
export const register = registerApi;

