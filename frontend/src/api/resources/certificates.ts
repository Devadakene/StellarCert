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

// ==================== TEMPLATE MANAGEMENT ====================

export const fetchDefaultTemplate = async (): Promise<CertificateTemplate> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    const template = dummyData.templates[0];
    console.log("Dummy Template Data:", template);
    return template;
  }

  try {
    return await apiClient<CertificateTemplate>("/templates/default");
  } catch (error) {
    return handleError(error, "fetchDefaultTemplate");
  }
};

export const templateApi = {
  list: async (): Promise<CertificateTemplate[]> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      return dummyData.templates;
    }
    return apiClient<CertificateTemplate[]>("/templates");
  },
  getDefaultTemplate: fetchDefaultTemplate,
};

// ==================== CERTIFICATE MANAGEMENT ====================

export const verifyCertificate = async (
  serialNumber: string,
): Promise<VerificationResult> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    const certificate = dummyData.certificates.find(
      (cert) => cert.serialNumber === serialNumber,
    );
    const result: VerificationResult = certificate
      ? {
          isValid: certificate.status === "active",
          status: certificate.status === "active" ? "valid" : "revoked",
          certificate,
          verificationDate: new Date().toISOString(),
          verifiedAt: new Date().toISOString(),
          message:
            certificate.status === "active"
              ? "Certificate is valid and active"
              : "Certificate has been revoked.",
          verificationId: `ver_${Date.now()}`,
        }
      : {
          isValid: false,
          status: "not_found",
          verificationDate: new Date().toISOString(),
          verifiedAt: new Date().toISOString(),
          message: "Certificate not found",
          verificationId: `ver_${Date.now()}`,
        };
    console.log("Dummy Verification:", result);
    return result;
  }

  try {
    return await apiClient<VerificationResult>(
      `/certificates/verify/${encodeURIComponent(serialNumber)}`,
    );
  } catch (error) {
    return handleError(error, "verifyCertificate");
  }
};

export const createCertificate = async (
  data: CreateCertificateData,
): Promise<Certificate> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    const newCertificate: Certificate = {
      id: `cert-${Date.now()}`,
      serialNumber: `CERT-${new Date().getFullYear()}-${Math.floor(
        Math.random() * 1000,
      )
        .toString()
        .padStart(3, "0")}`,
      recipientName: data.recipientName,
      recipientEmail: data.recipientEmail,
      title: "New Certificate",
      courseName: data.courseName,
      issuerName: "StellarCert Academy",
      issueDate: new Date().toISOString(),
      status: "active",
    };
    dummyData.certificates.push(newCertificate);
    console.log("Dummy certificate created:", newCertificate);
    return newCertificate;
  }

  try {
    const payload = {
      issuerId: data.issuerId,
      recipientId: data.recipientId || undefined,
      recipientEmail: data.recipientEmail,
      recipientName: data.recipientName,
      title: data.title,
      description: data.description || undefined,
      courseName: data.courseName || undefined,
      issuerName: data.issuerName || undefined,
      expiresAt: data.expiryDate || undefined,
      templateId: data.templateId || undefined,
      metadata: data.metadata || undefined,
    };
    return await apiClient<Certificate>("/certificates", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return handleError(error, "createCertificate");
  }
};

export const revokeCertificate = async (
  id: string,
  reason: string,
): Promise<Certificate> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    const certificate = dummyData.certificates.find((cert) => cert.id === id);
    if (certificate) {
      certificate.status = "revoked";
      console.log("Dummy certificate revoked:", certificate);
      return certificate;
    }
    throw new Error("Certificate not found");
  }

  try {
    return await apiClient<Certificate>(`/certificates/${id}/revoke`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    });
  } catch (error) {
    return handleError(error, "revokeCertificate");
  }
};

export const findCertBySerialNumber = async (
  serialNumber: string,
): Promise<Certificate | null> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    const certificate = dummyData.certificates.find(
      (cert) => cert.serialNumber === serialNumber,
    );
    console.log("Dummy Certificate:", certificate);
    return certificate || null;
  }

  try {
    return await apiClient<Certificate | null>(
      `/certificates/serial/${serialNumber}`,
    );
  } catch (error) {
    return handleError(error, "findCertBySerialNumber");
  }
};

export const getCertificatePdfUrl = async (
  certificateId: string,
): Promise<string | null> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    const certificate = dummyData.certificates.find(
      (cert) => cert.id === certificateId,
    );
    return certificate ? `/api/dummy-pdf/${certificateId}` : null;
  }

  try {
    const data = await apiClient<{ pdfUrl: string }>(
      `/certificates/${certificateId}/pdf`,
    );
    return data.pdfUrl;
  } catch (error) {
    return handleError(error, "getCertificatePdfUrl");
  }
};

export const getUserCertificates = async (
  userId: string,
): Promise<Certificate[]> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    return dummyData.certificates.filter(
      (cert) => cert.recipientEmail === userId || cert.id === userId,
    );
  }

  try {
    const result = await apiClient<Certificate[] | { certificates: Certificate[]; total: number } | PaginatedResponse<Certificate>>(`/certificates/user/${userId}`);
    if (Array.isArray(result)) return result;
    if ('data' in result) return (result as PaginatedResponse<Certificate>).data;
    if ('certificates' in result) return (result as { certificates: Certificate[] }).certificates;
    return [];
  } catch (error) {
    return handleError(error, "getUserCertificates");
  }
};

export const getCertificateQR = async (
  certificateId: string,
): Promise<string> => {
  if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
    await simulateDelay();
    // Return a dummy QR code URL
    return `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+CiAgPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkJJIENvZGU6ICR7Y2VydGlmaWNhdGVJZH08L3RleHQ+Cjwvc3ZnPg==`;
  }

  try {
    const data = await apiClient<{ qrCode: string }>(
      `/certificates/${certificateId}/qr`,
    );
    return data.qrCode;
  } catch (error) {
    return handleError(error, "getCertificateQR");
  }
};

export const certificateApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    startDate?: string;
    endDate?: string;
  }): Promise<PaginatedResponse<Certificate>> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          searchParams.append(key, String(value));
        }
      });
    }
    return apiClient<PaginatedResponse<Certificate>>(
      `/certificates?${searchParams.toString()}`,
    );
  },
  create: createCertificate,
  verify: verifyCertificate,
  revoke: revokeCertificate,
  getById: async (id: string): Promise<Certificate> => {
    return apiClient<Certificate>(`/certificates/${id}`);
  },
  getAll: async (
    params?: Record<string, string | number | boolean>,
  ): Promise<PaginatedResponse<Certificate> | Certificate[]> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        searchParams.set(key, String(value));
      });
    }

    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      return {
        data: dummyData.certificates,
        certificates: dummyData.certificates,
        total: dummyData.certificates.length,
        page: 1,
        limit: dummyData.certificates.length,
        totalPages: 1,
      } as PaginatedResponse<Certificate> & { certificates: Certificate[] };
    }

    return apiClient<PaginatedResponse<Certificate>>(
      `/certificates?${searchParams.toString()}`,
    );
  },
  getUserCertificates,
  bulkExport: async (
    certificateIds: string[],
    filters?: CertificateExportFilters,
  ): Promise<Blob> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      const headers = [
        "ID",
        "Recipient Name",
        "Email",
        "Title",
        "Status",
        "Issue Date",
      ];
      const normalizedSearch = filters?.search?.trim().toLowerCase();
      const startDate = filters?.startDate ? new Date(filters.startDate) : null;
      const endDate = filters?.endDate ? new Date(filters.endDate) : null;
      const certs = dummyData.certificates.filter((certificate) => {
        const matchesIds =
          certificateIds.length === 0 ||
          certificateIds.includes(certificate.id);
        const matchesSearch =
          !normalizedSearch ||
          [
            certificate.id,
            certificate.serialNumber,
            certificate.recipientName,
            certificate.recipientEmail,
            certificate.title,
            certificate.issuerName,
          ].some((value) => value?.toLowerCase().includes(normalizedSearch));
        const matchesStatus =
          !filters?.status || certificate.status === filters.status;
        const issueDate = new Date(certificate.issueDate);
        const matchesStartDate = !startDate || issueDate >= startDate;
        const matchesEndDate = !endDate || issueDate <= endDate;

        return (
          matchesIds &&
          matchesSearch &&
          matchesStatus &&
          matchesStartDate &&
          matchesEndDate
        );
      });
      const rows = certs.map((c) => [
        c.id,
        c.recipientName,
        c.recipientEmail,
        c.title,
        c.status,
        c.issueDate,
      ]);
      const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
      return new Blob([csv], { type: "text/csv" });
    }
    const response = await apiClientRaw(`${API_URL}/certificates/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStorage.getAccessToken()}`,
      },
      body: JSON.stringify({ certificateIds, filters }),
    });
    if (!response.ok) throw new Error("Export failed");
    return response.blob();
  },
  bulkExportAll: async (filters?: CertificateExportFilters): Promise<Blob> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      const headers = [
        "ID",
        "Recipient Name",
        "Email",
        "Title",
        "Status",
        "Issue Date",
      ];
      const normalizedSearch = filters?.search?.trim().toLowerCase();
      const startDate = filters?.startDate ? new Date(filters.startDate) : null;
      const endDate = filters?.endDate ? new Date(filters.endDate) : null;
      const certs = dummyData.certificates.filter((certificate) => {
        const matchesSearch =
          !normalizedSearch ||
          [
            certificate.id,
            certificate.serialNumber,
            certificate.recipientName,
            certificate.recipientEmail,
            certificate.title,
            certificate.issuerName,
          ].some((value) => value?.toLowerCase().includes(normalizedSearch));
        const matchesStatus =
          !filters?.status || certificate.status === filters.status;
        const issueDate = new Date(certificate.issueDate);
        const matchesStartDate = !startDate || issueDate >= startDate;
        const matchesEndDate = !endDate || issueDate <= endDate;

        return (
          matchesSearch && matchesStatus && matchesStartDate && matchesEndDate
        );
      });
      const rows = certs.map((c) => [
        c.id,
        c.recipientName,
        c.recipientEmail,
        c.title,
        c.status,
        c.issueDate,
      ]);
      const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
      return new Blob([csv], { type: "text/csv" });
    }

    const response = await apiClientRaw(`${API_URL}/certificates/export/all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStorage.getAccessToken()}`,
      },
      body: JSON.stringify({ filters }),
    });
    if (!response.ok) {
      throw new Error("Export failed");
    }
    return response.blob();
  },
  bulkRevoke: async (
    certificateIds: string[],
    reason?: string,
  ): Promise<Certificate[]> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      const updatedCerts: Certificate[] = [];
      for (const id of certificateIds) {
        const cert = dummyData.certificates.find((certificate) => certificate.id === id);
        if (cert) {
          cert.status = "revoked";
          updatedCerts.push(cert);
        }
      }
      return updatedCerts;
    }

    return apiClient<Certificate[]>("/certificates/bulk-revoke", {
      method: "POST",
      body: JSON.stringify({ certificateIds, reason }),
    });
  },
  freeze: async (
    certificateId: string,
    reason: string,
    durationDays: number,
  ): Promise<Certificate> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      const cert = dummyData.certificates.find((certificate) => certificate.id === certificateId);
      if (!cert) {
        throw new Error("Certificate not found");
      }

      cert.status = "frozen";
      cert.freezeReason = reason;
      cert.frozenAt = new Date().toISOString();
      const unfreezeDate = new Date();
      unfreezeDate.setDate(unfreezeDate.getDate() + durationDays);
      cert.unfreezeAt = unfreezeDate.toISOString();
      return cert;
    }

    return apiClient<Certificate>(`/certificates/${certificateId}/freeze`, {
      method: "PATCH",
      body: JSON.stringify({ reason, durationDays }),
    });
  },
  unfreeze: async (certificateId: string): Promise<Certificate> => {
    if ((import.meta.env.VITE_USE_DUMMY_DATA === 'true')) {
      await simulateDelay();
      const cert = dummyData.certificates.find((certificate) => certificate.id === certificateId);
      if (!cert) {
        throw new Error("Certificate not found");
      }

      cert.status = "active";
      cert.freezeReason = undefined;
      cert.frozenAt = undefined;
      cert.unfreezeAt = undefined;
      return cert;
    }

    return apiClient<Certificate>(`/certificates/${certificateId}/unfreeze`, {
      method: "PATCH",
    });
  },
  getQR: getCertificateQR,

  // Certificate Transfer API (#286)
  transfer: {
    initiate: async (data: InitiateTransferDto): Promise<CertificateTransfer> => {
      return apiClient("/certificates/transfers/initiate", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    approve: async (data: ApproveTransferDto): Promise<CertificateTransfer> => {
      return apiClient("/certificates/transfers/approve", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    reject: async (data: RejectTransferDto): Promise<CertificateTransfer> => {
      return apiClient("/certificates/transfers/reject", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    getPending: async (): Promise<CertificateTransfer[]> => {
      return apiClient("/certificates/transfers/pending");
    },
  }
};

