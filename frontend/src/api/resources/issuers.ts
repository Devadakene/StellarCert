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
import { apiClient, apiClientRaw, USE_DUMMY_DATA, API_URL, dummyData, simulateDelay, handleError } from '../client';

// ==================== USER MANAGEMENT ====================

export const fetchUserByEmail = async (email: string): Promise<User | null> => {
  if (USE_DUMMY_DATA) {
    await simulateDelay();
    const user = dummyData.users.find((user) => user.email === email);

    return user || null;
  }

  try {
    return await apiClient<User | null>(`/users/email/${email}`);
  } catch (error) {
    return handleError(error, "fetchUserByEmail");
  }
};

export const userApi = {
  getProfile: async (): Promise<User> => {
    return apiClient<User>("/users/profile");
  },
  updateProfile: async (data: ProfileUpdateData): Promise<User> => {
    return apiClient<User>("/users/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  getByEmail: fetchUserByEmail,
  listAll: async (
    params?: Record<string, string | number | boolean>,
  ): Promise<PaginatedResponse<User>> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, String(value));
      });
    }
    return apiClient<PaginatedResponse<User>>(
      `/users?${searchParams.toString()}`,
    );
  },
  getAll: async (params?: Record<string, string | number | boolean>) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        searchParams.set(key, String(value));
      });
    }
    return apiClient<PaginatedResponse<User>>(`/users?${searchParams.toString()}`);
  },
  getById: async (id: string) => apiClient<User>(`/users/${id}`),
  updateRole: async (id: string, role: string) =>
    apiClient<User>(`/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  toggleStatus: async (id: string, isActive: boolean) =>
    apiClient<User>(`/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
  delete: async (id: string) => apiClient<void>(`/users/${id}`, { method: "DELETE" }),
};

export const issuerProfileApi = {
  getStats: async (): Promise<IssuerStats> => {
    if (USE_DUMMY_DATA) {
      await simulateDelay();
      return {
        totalCertificates: 125,
        activeCertificates: 118,
        revokedCertificates: 7,
        expiredCertificates: 0,
        totalVerifications: 2847,
        lastLogin: new Date().toISOString(),
      };
    }
    return apiClient<IssuerStats>("/users/profile/stats");
  },
  getActivity: async (
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedActivityLog> => {
    if (USE_DUMMY_DATA) {
      await simulateDelay();
      const activities = [
        {
          id: "1",
          action: "ISSUE_CERTIFICATE",
          description: 'Issued "Blockchain Fundamentals" certificate to Alice Johnson',
          ipAddress: "192.168.1.100",
          userAgent: "Mozilla/5.0",
          timestamp: new Date().toISOString(),
        },
      ];
      return {
        activities,
        meta: {
          total: activities.length,
          page,
          limit,
          totalPages: 1,
        },
      };
    }
    return apiClient<PaginatedActivityLog>(
      `/users/profile/activity?page=${page}&limit=${limit}`,
    );
  },
  updateProfile: async (data: ProfileUpdateData): Promise<User> => {
    if (USE_DUMMY_DATA) {
      await simulateDelay();
      return dummyData.users[0];
    }
    return apiClient<User>("/users/profile/issuer", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  uploadProfilePicture: async (
    file: File,
  ): Promise<{ profilePicture: string; message: string }> => {
    if (USE_DUMMY_DATA) {
      await simulateDelay();
      return {
        profilePicture: URL.createObjectURL(file),
        message: "Profile picture uploaded successfully",
      };
    }

    const formData = new FormData();
    formData.append("file", file);

    // Multipart upload: route through apiClientRaw so the browser sets the
    // multipart boundary (apiClient would force application/json and break it),
    // while still getting auth + 401-refresh handling.
    const response = await apiClientRaw(`${API_URL}/users/profile/picture`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({
        message: response.statusText || "Profile picture upload failed",
        statusCode: response.status,
      }));
      throw errorData;
    }
    return response.json();
  },
};
