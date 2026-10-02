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

type CertificateStatsResponse = {
  totalCertificates: number;
  activeCertificates: number;
  revokedCertificates: number;
  expiredCertificates: number;
  issuanceTrend: IssuanceTrendPoint[];
  verificationStats: {
    totalVerifications: number;
    successfulVerifications: number;
    failedVerifications: number;
    dailyVerifications: number;
    weeklyVerifications: number;
  };
};

const buildStatusDistributionFromCertificates = (
  certificates: Certificate[],
): StatusDistribution => {
  const base: StatusDistribution = {
    active: 0,
    revoked: 0,
    expired: 0,
  };

  for (const cert of certificates) {
    if (cert.status === "active") {
      base.active += 1;
    } else if (cert.status === "revoked") {
      base.revoked += 1;
    } else if (cert.status === "expired") {
      base.expired += 1;
    }
  }

  return base;
};

const buildIssuanceTrendFromCertificates = (
  certificates: Certificate[],
): IssuanceTrendPoint[] =>
  Array.from(
    certificates.reduce((map, cert) => {
      const dateKey = cert.issueDate.slice(0, 10);
      map.set(dateKey, (map.get(dateKey) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

const buildRecentActivityFromCertificates = (
  certificates: Certificate[],
): ActivityItem[] =>
  certificates
    .map((cert) => ({
      type: (cert.status === "revoked" ? "revoke" : "issue") as ActivityItem["type"],
      date: cert.issueDate,
      description:
        cert.status === "revoked"
          ? `Revoked ${cert.title} for ${cert.recipientName}`
          : `Issued ${cert.title} to ${cert.recipientName}`,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

export const dailyCertificateVerification =
  async (): Promise<DailyVerificationStats> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      return { count: Math.floor(Math.random() * 50) + 20 };
    }
    return apiClient<DailyVerificationStats>(
      "/certificates/stats/daily-verification",
    );
  };

export const totalCertificates = async (): Promise<TotalCertificatesStats> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    return { total: dummyData.certificates.length };
  }
  return apiClient<TotalCertificatesStats>("/certificates/stats/total");
};

export const totalActiveUsers = async (): Promise<TotalActiveUsersStats> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    return { total: dummyData.users.length };
  }
  return apiClient<TotalActiveUsersStats>("/users/stats/active");
};

export const analyticsApi = {
  getDashboardSummary: async (params?: {
    startDate?: string;
    endDate?: string;
    issuerId?: string;
  }): Promise<DashboardStats> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();

      let certificates = dummyData.certificates;
      if (params?.startDate && params?.endDate) {
        const start = new Date(params.startDate);
        const end = new Date(params.endDate);
        certificates = certificates.filter((cert) => {
          const issuedAt = new Date(cert.issueDate);
          return issuedAt >= start && issuedAt <= end;
        });
      }

      const statusDistribution =
        buildStatusDistributionFromCertificates(certificates);

      return {
        totalCertificates: certificates.length,
        activeCertificates: statusDistribution.active,
        revokedCertificates: statusDistribution.revoked,
        expiredCertificates: statusDistribution.expired,
        totalVerifications: 1250,
        verifications24h: 45,
        totalUsers: dummyData.users.length,
        issuanceTrend: buildIssuanceTrendFromCertificates(certificates),
        statusDistribution,
        recentActivity: buildRecentActivityFromCertificates(certificates),
      };
    }

    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);
    if (params?.issuerId) searchParams.set("issuerId", params.issuerId);
    const query = searchParams.toString();

    const data = await apiClient<CertificateStatsResponse>(
      `/certificates/stats${query ? `?${query}` : ""}`,
    );

    return {
      totalCertificates: data.totalCertificates,
      activeCertificates: data.activeCertificates,
      revokedCertificates: data.revokedCertificates,
      expiredCertificates: data.expiredCertificates,
      totalVerifications: data.verificationStats.totalVerifications,
      verifications24h: data.verificationStats.dailyVerifications,
      totalUsers: 0,
      issuanceTrend: data.issuanceTrend,
      statusDistribution: {
        active: data.activeCertificates,
        revoked: data.revokedCertificates,
        expired: data.expiredCertificates,
      },
      recentActivity: [],
    };
  },
};

export const adminAnalyticsApi = {
  getAnalytics: async (params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<import("./types").AdminAnalytics> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      return {
        usersByRole: {
          users: 42,
          issuers: 12,
          admins: 3,
          total: dummyData.users.length,
        },
        usersByStatus: {
          active: dummyData.users.length,
          inactive: 0,
          suspended: 0,
          pendingVerification: 0,
        },
        certificatesByStatus: {
          active: dummyData.certificates.filter((cert) => cert.status === "active").length,
          revoked: dummyData.certificates.filter((cert) => cert.status === "revoked").length,
          expired: dummyData.certificates.filter((cert) => cert.status === "expired").length,
          total: dummyData.certificates.length,
        },
        topIssuers: [
          {
            issuerId: "issuer-1",
            issuerName: "StellarCert Academy",
            certificateCount: dummyData.certificates.length,
            percentage: 100,
          },
        ],
        verificationTrends: {
          total: 1200,
          successful: 1140,
          failed: 60,
          successRate: 95,
          last24Hours: 45,
          last7Days: 210,
          last30Days: 830,
        },
        userRegistrationTrend: [
          { date: params?.startDate ?? new Date().toISOString().slice(0, 10), count: 2 },
        ],
        certificateIssuanceTrend: buildIssuanceTrendFromCertificates(
          dummyData.certificates,
        ),
        totalIssuers: 12,
      };
    }

    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);
    return apiClient(`/admin/analytics?${searchParams.toString()}`);
  },
};

// ==================== DASHBOARD & ANALYTICS ====================

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      return {
        totalCertificates: 1250,
        activeCertificates: 1200,
        revokedCertificates: 30,
        expiredCertificates: 20,
        issuanceTrend: [
          { date: "2023-01", count: 100 },
          { date: "2023-02", count: 120 },
          { date: "2023-03", count: 150 },
        ],
        totalVerifications: 450,
        verifications24h: 15,
        totalUsers: 1150,
        statusDistribution: {
          active: 1200,
          revoked: 30,
          expired: 20
        },
        recentActivity: [
          {
            type: "issue",
            date: new Date().toISOString(),
            description: "Issued certificate 'Blockchain Expert' to John Doe",
          },
        ],
      };
    }
    const data = await apiClient<AdminAnalytics>("/admin/analytics");
    return {
      totalCertificates: data.certificatesByStatus.total,
      activeCertificates: data.certificatesByStatus.active,
      revokedCertificates: data.certificatesByStatus.revoked,
      expiredCertificates: data.certificatesByStatus.expired,
      totalVerifications: data.verificationTrends.total,
      verifications24h: data.verificationTrends.last24Hours,
      totalUsers: data.usersByRole.total,
      issuanceTrend: data.certificateIssuanceTrend,
      recentActivity: [],
    };
  },

  getRecentActivity: async (limit = 10): Promise<ActivityItem[]> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      return [
        {
          type: "issue",
          date: new Date().toISOString(),
          description: "Issued certificate 'Blockchain Expert' to John Doe",
        },
      ];
    }
    return apiClient<ActivityItem[]>(`/admin/analytics/activity?limit=${limit}`);
  },
};

