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

// ==================== AUDIT LOGS (#283) ====================

export const auditApi = {
  getLogs: async (params?: AuditLogQueryParams): Promise<PaginatedActivityLog> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) searchParams.append(key, String(value));
      });
    }
    return apiClient<PaginatedActivityLog>(`/audit?${searchParams.toString()}`);
  },
  getCertificateHistory: async (certificateId: string): Promise<ActivityItem[]> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      return [
        {
          type: "issue",
          date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          description: "Certificate issued to recipient",
        },
        {
          type: "verify",
          date: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
          description: "Certificate verified by verifier",
        },
      ];
    }
    const response = await apiClient<AuditLogItem[]>(`/audit/certificates/${certificateId}/history`);
    return response.map((log) => {
      let type: "issue" | "verify" | "revoke" = "issue";
      const actionLower = (log.action || "").toLowerCase();
      if (actionLower.includes("revoke")) {
        type = "revoke";
      } else if (
        actionLower.includes("verify") ||
        actionLower.includes("verified") ||
        actionLower.includes("check")
      ) {
        type = "verify";
      }
      return {
        type,
        date: new Date(Number(log.timestamp) || log.createdAt || Date.now()).toISOString(),
        description: log.description || log.errorMessage || `${String(log.action).replace(/_/g, " ")} by ${log.userEmail || "unknown"}`,
      };
    });
  },
  searchLogs: async (
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<import("./types").AuditLogSearchResponse> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          searchParams.set(key, String(value));
        }
      });
    }

    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      return {
        data: [
          {
            id: "audit-1",
            action: "ISSUE_CERTIFICATE",
            description: "Issued Blockchain Fundamentals to Alice Johnson",
            timestamp: new Date().toISOString(),
            ipAddress: "127.0.0.1",
          },
        ],
        total: 1,
      };
    }

    return apiClient(`/audit/search?${searchParams.toString()}`);
  },
  getStatistics: async (
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<import("./types").AuditStatistics> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          searchParams.set(key, String(value));
        }
      });
    }

    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      return {
        total: 1,
        byAction: {
          ISSUE_CERTIFICATE: 1,
        },
      };
    }

    return apiClient(`/audit/statistics?${searchParams.toString()}`);
  },
  exportCsvUrl: (
    params?: Record<string, string | number | boolean | undefined>,
  ) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          searchParams.set(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return `${API_URL}/audit/export${query ? `?${query}` : ""}`;
  },
};

