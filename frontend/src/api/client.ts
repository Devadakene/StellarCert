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
} from "./types";
import { tokenStorage, notifyTokenRefreshed } from "./tokens";

interface AuditLogQueryParams {
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

const viteEnv = import.meta as unknown as { env: Record<string, string> };
const API_URL_BASE = viteEnv.env?.VITE_API_URL || "http://localhost:3000/api/v1";
export const API_URL = API_URL_BASE;

// Helper function to simulate API delay
const simulateDelay = () => new Promise((resolve) => setTimeout(resolve, 300));

// Common error handler
const handleError = (error: unknown, endpointName: string): never => {
  console.error(`Error in ${endpointName}:`, error);
  const apiError: ApiError = {
    message:
      error instanceof Error ? error.message : "An unexpected error occurred",
    statusCode:
      error && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode: number }).statusCode
        : 500,
    error:
      error && typeof error === "object" && "name" in error
        ? (error as { name: string }).name
        : "API Error",
  };
  throw apiError;
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Refresh tokens using the HttpOnly cookie sent automatically by the browser.
 *
 * De-duplicated + cooldown-guarded: on page load the in-memory access token is
 * gone, so AuthContext rehydration AND every protected request's 401 handler
 * would each hit `/auth/refresh` (which is IP rate-limited) near-simultaneously,
 * tripping a 429. We coalesce concurrent callers onto a single in-flight request
 * and briefly back off after a failure so a page full of 401s can't hammer it.
 */
let _refreshInFlight: Promise<AuthResponse> | null = null;
let _refreshCooldownUntil = 0;
const REFRESH_COOLDOWN_MS = 10_000;

const refreshTokens = async (): Promise<AuthResponse> => {
  if (Date.now() < _refreshCooldownUntil) {
    const err: ApiError = {
      message: "Session refresh temporarily unavailable",
      statusCode: 401,
    };
    throw err;
  }
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = apiClient<AuthResponse>('/auth/refresh', {
    method: 'POST',
    skipAuth: true,
  })
    .catch((err) => {
      // Back off briefly so repeated 401s during this load don't spam refresh.
      _refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS;
      throw err;
    })
    .finally(() => {
      _refreshInFlight = null;
    });

  return _refreshInFlight;
};

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryCondition?: (error: unknown) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  baseDelay: 300,
  maxDelay: 2000,
  backoffFactor: 2,
  retryCondition: (error) => {
    // Retry on network errors and 5xx server errors
    const status = (error as { statusCode?: number } | undefined)?.statusCode;
    return !status || (status >= 500 && status < 600);
  }
};

/**
 * Standardized API client for all requests with retry logic
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestInit & { skipAuth?: boolean } = {},
  retryConfig: Partial<RetryConfig> = {},
): Promise<T> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  const url = `${API_URL}${endpoint}`;
  const isGetRequest = !options.method || options.method.toUpperCase() === 'GET';

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (!options.skipAuth) {
    const token = tokenStorage.getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const attemptRequest = async (attempt: number, hasTriedRefresh: boolean = false): Promise<T> => {
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({
          message: response.statusText || "API request failed",
          statusCode: response.status,
        }));

        // Never attempt a refresh for the refresh call itself (skipAuth) — that
        // would recurse into refreshTokens and, with the shared in-flight
        // promise, deadlock the request against itself.
        if (response.status === 401 && !hasTriedRefresh && !options.skipAuth) {
          try {
            const refreshResponse = await refreshTokens();
            tokenStorage.setAccessToken(refreshResponse.accessToken);
            headers.set("Authorization", `Bearer ${refreshResponse.accessToken}`);
            // Forward the fresh user too so AuthContext updates both the user
            // object and isAuthenticated, not just the stored token (#560).
            notifyTokenRefreshed(refreshResponse.accessToken, refreshResponse.user);
            // Retry the original request with hasTriedRefresh = true
            return attemptRequest(attempt, true);
          } catch (refreshError) {
            tokenStorage.clearTokens();
            throw errorData;
          }
        } else if (response.status === 401) {
          tokenStorage.clearTokens();
          throw errorData;
        }

        throw errorData;
      }

      if (response.status === 204) {
        return {} as T;
      }

      const json = await response.json();
      // Unwrap the global ResponseInterceptor envelope { statusCode, message, data }
      if (json && typeof json === 'object' && 'data' in json && 'statusCode' in json) {
        return json.data as T;
      }
      return json as T;
    } catch (error) {
      // Don't retry if this is the last attempt or retry condition is not met
      if (attempt >= config.maxRetries || !config.retryCondition?.(error)) {
        if ((error as ApiError).statusCode) {
          throw error;
        }

        const apiError: ApiError = {
          message:
            error instanceof Error ? error.message : "An unexpected error occurred",
          statusCode: 0,
          error: "Network Error",
        };
        throw apiError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
        config.maxDelay
      );

      console.warn(`API request failed (attempt ${attempt}/${config.maxRetries + 1}), retrying in ${delay}ms:`, error);

      await sleep(delay);
      return attemptRequest(attempt + 1, hasTriedRefresh);
    }
  };

  // Only apply retry logic to GET requests by default
  if (isGetRequest) {
    return attemptRequest(1, false);
  } else {
    // For non-GET requests, make a single attempt
    return attemptRequest(config.maxRetries + 1, false);
  }
}

/**
 * Raw request helper for endpoints that need the underlying `Response`
 * (file/blob downloads and multipart uploads) rather than the parsed,
 * envelope-unwrapped JSON that `apiClient` returns. It attaches the bearer
 * token and performs a single transparent refresh-and-retry on a 401, but does
 * NOT force a JSON `Content-Type` — so callers can send `FormData` (letting the
 * browser set the multipart boundary) or their own JSON body.
 */
export async function apiClientRaw(
  url: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (!options.skipAuth) {
    const token = tokenStorage.getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response = await fetch(url, { ...options, headers, credentials: "include" });

  if (response.status === 401 && !options.skipAuth) {
    try {
      const refreshResponse = await refreshTokens();
      tokenStorage.setAccessToken(refreshResponse.accessToken);
      headers.set("Authorization", `Bearer ${refreshResponse.accessToken}`);
      notifyTokenRefreshed(refreshResponse.accessToken, refreshResponse.user);
      response = await fetch(url, { ...options, headers, credentials: "include" });
    } catch {
      tokenStorage.clearTokens();
    }
  }

  return response;
}

// Dummy data generators
export const dummyData = {
  users: [
    {
      id: "1",
      email: "john@example.com",
      firstName: "John",
      lastName: "Doe",
      role: UserRole.ISSUER,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "2",
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Smith",
      role: UserRole.RECIPIENT,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] as User[],

  certificates: [
    {
      id: "cert-1",
      serialNumber: "CERT-2023-001",
      recipientName: "John Doe",
      recipientEmail: "john@example.com",
      issueDate: new Date().toISOString(),
      expiryDate: new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      issuerName: "StellarCert Academy",
      status: "active",
      title: "Blockchain Expert",
      courseName: "Stellar Fundamentals",
    },
    {
      id: "cert-2",
      serialNumber: "CERT-2023-002",
      recipientName: "Jane Smith",
      recipientEmail: "jane@example.com",
      issueDate: new Date().toISOString(),
      expiryDate: new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      issuerName: "StellarCert Academy",
      status: "revoked",
      title: "Web3 Developer",
      courseName: "Smart Contract Development",
    },
  ] as Certificate[],

  templates: [
    {
      id: "template-default",
      name: "Default Template",
      description: "Standard academic certificate template",
      layoutUrl: "/templates/default.pdf",
      fields: ["name", "date", "course"],
      issuerId: "1",
    },
  ] as CertificateTemplate[],
};



