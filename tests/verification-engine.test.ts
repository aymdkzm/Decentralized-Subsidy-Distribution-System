// VerificationEngine.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface FarmData {
  landSize: number;
  cropType: string;
  yieldHistory: number[];
  gps: Buffer;
  owner: string;
}

interface Criteria {
  minLandSize: number;
  requiredCrops: string[];
  minYield: number;
  sustainabilityScore: number;
}

interface OracleData {
  weatherImpact: number;
  marketPrice: number;
  verifiedYield: number;
}

interface ApplicationStatus {
  status: string;
  farmerId: number;
}

interface ScoreEntry {
  score: number;
  verifiedAt: number;
  factors: { factor: string; points: number }[];
}

interface Appeal {
  reason: string;
  submittedAt: number;
  resolved: boolean;
  resolver: string;
}

interface AuditEntry {
  applicationId: number;
  farmer: string;
  score: number;
  timestamp: number;
  outcome: boolean;
}

interface SystemStatus {
  paused: boolean;
  admin: string;
  oracle: string;
  totalVerifications: number;
  fee: number;
}

interface ContractState {
  oracle: string;
  systemPaused: boolean;
  admin: string;
  totalVerifications: number;
  verificationFee: number;
  eligibilityScores: Map<number, ScoreEntry>;
  appeals: Map<number, Appeal>;
  auditTrail: Map<number, AuditEntry>;
}

// Mock trait implementations
class MockFarmDataTrait {
  getFarmData(farmerId: number): ClarityResponse<FarmData> {
    return {
      ok: true,
      value: {
        landSize: 50,
        cropType: "Corn",
        yieldHistory: [100, 120, 110, 130, 115],
        gps: Buffer.from("mockgps"),
        owner: "farmer1",
      },
    };
  }
}

class MockCriteriaTrait {
  getCurrentCriteria(): ClarityResponse<Criteria> {
    return {
      ok: true,
      value: {
        minLandSize: 40,
        requiredCrops: ["Corn", "Wheat"],
        minYield: 100,
        sustainabilityScore: 15,
      },
    };
  }
}

class MockOracleTrait {
  getExternalData(farmerId: number): ClarityResponse<OracleData> {
    return { ok: true, value: { weatherImpact: 5, marketPrice: 10, verifiedYield: 105 } };
  }
}

class MockApplicationTrait {
  private statuses: Map<number, ApplicationStatus> = new Map();

  getApplicationStatus(applicationId: number): ClarityResponse<ApplicationStatus> {
    const status = this.statuses.get(applicationId);
    return status ? { ok: true, value: status } : { ok: false, value: 102 };
  }

  updateApplicationStatus(applicationId: number, status: string): ClarityResponse<boolean> {
    const existing = this.statuses.get(applicationId);
    if (existing) {
      this.statuses.set(applicationId, { ...existing, status });
      return { ok: true, value: true };
    }
    return { ok: false, value: 102 };
  }

  // Helper for tests
  setInitialStatus(applicationId: number, farmerId: number) {
    this.statuses.set(applicationId, { status: "PENDING", farmerId });
  }
}

// Mock contract implementation
class VerificationEngineMock {
  private state: ContractState = {
    oracle: "oracle",
    systemPaused: false,
    admin: "admin",
    totalVerifications: 0,
    verificationFee: 100,
    eligibilityScores: new Map(),
    appeals: new Map(),
    auditTrail: new Map(),
  };

  private ERR_NOT_AUTHORIZED = 100;
  private ERR_INVALID_FARMER = 101;
  private ERR_INVALID_APPLICATION = 102;
  private ERR_CRITERIA_NOT_MET = 103;
  private ERR_ORACLE_FAILURE = 104;
  private ERR_APPEAL_EXISTS = 105;
  private ERR_NO_APPEAL = 106;
  private ERR_INVALID_SCORE = 107;
  private ERR_SYSTEM_PAUSED = 108;
  private ERR_INVALID_DATA = 109;
  private MIN_SCORE_THRESHOLD = 70;
  private MAX_APPEAL_WINDOW = 144;

  private currentBlockHeight = 1000; // Mock block height

  // Helper to advance block height
  advanceBlock() {
    this.currentBlockHeight++;
  }

  setOracle(caller: string, newOracle: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.oracle = newOracle;
    return { ok: true, value: true };
  }

  pauseSystem(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.systemPaused = true;
    return { ok: true, value: true };
  }

  unpauseSystem(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.systemPaused = false;
    return { ok: true, value: true };
  }

  verifyEligibility(
    caller: string,
    farmerId: number,
    applicationId: number,
    farmStorage: MockFarmDataTrait,
    criteriaContract: MockCriteriaTrait,
    oracleContract: MockOracleTrait,
    appHandler: MockApplicationTrait
  ): ClarityResponse<number> {
    if (this.state.systemPaused) {
      return { ok: false, value: this.ERR_SYSTEM_PAUSED };
    }
    const farmDataResp = farmStorage.getFarmData(farmerId);
    if (!farmDataResp.ok) return farmDataResp;
    const farmData = farmDataResp.value;

    const criteriaResp = criteriaContract.getCurrentCriteria();
    if (!criteriaResp.ok) return criteriaResp;
    const criteria = criteriaResp.value;

    const oracleDataResp = oracleContract.getExternalData(farmerId);
    if (!oracleDataResp.ok) return oracleDataResp;
    const oracleData = oracleDataResp.value;

    const appStatusResp = appHandler.getApplicationStatus(applicationId);
    if (!appStatusResp.ok) return appStatusResp;
    const appStatus = appStatusResp.value;

    if (farmData.owner !== caller) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (appStatus.farmerId !== farmerId) {
      return { ok: false, value: this.ERR_INVALID_FARMER };
    }

    // Calculate score
    const landPoints = farmData.landSize >= criteria.minLandSize ? 30 : 0;
    const cropPoints = criteria.requiredCrops.includes(farmData.cropType) ? 20 : 0;
    const avgYield = farmData.yieldHistory.reduce((a, b) => a + b, 0) / farmData.yieldHistory.length;
    const yieldPoints = avgYield >= criteria.minYield ? 20 : 0;
    const sustainabilityPoints = criteria.sustainabilityScore;
    const oracleAdjustment = Math.floor((oracleData.weatherImpact + oracleData.marketPrice + oracleData.verifiedYield) / 3);
    let score = landPoints + cropPoints + yieldPoints + sustainabilityPoints + oracleAdjustment;
    if (score > 100) score = 100;

    const factors = [
      { factor: "Land Size", points: landPoints },
      { factor: "Crop Type", points: cropPoints },
      { factor: "Yield History", points: yieldPoints },
      { factor: "Sustainability", points: sustainabilityPoints },
      { factor: "Oracle Adjustment", points: oracleAdjustment },
    ];

    this.state.eligibilityScores.set(applicationId, { score, verifiedAt: this.currentBlockHeight, factors });

    // Log audit
    const qualifies = score >= this.MIN_SCORE_THRESHOLD;
    const verId = this.state.totalVerifications + 1;
    this.state.auditTrail.set(verId, {
      applicationId,
      farmer: caller,
      score,
      timestamp: this.currentBlockHeight,
      outcome: qualifies,
    });
    this.state.totalVerifications = verId;

    // Update app status
    appHandler.updateApplicationStatus(applicationId, qualifies ? "APPROVED" : "REJECTED");

    return qualifies ? { ok: true, value: score } : { ok: false, value: this.ERR_CRITERIA_NOT_MET };
  }

  submitAppeal(caller: string, applicationId: number, reason: string): ClarityResponse<boolean> {
    if (this.state.appeals.has(applicationId)) {
      return { ok: false, value: this.ERR_APPEAL_EXISTS };
    }
    const scoreEntry = this.state.eligibilityScores.get(applicationId);
    if (!scoreEntry) {
      return { ok: false, value: this.ERR_INVALID_APPLICATION };
    }
    if (this.currentBlockHeight - scoreEntry.verifiedAt >= this.MAX_APPEAL_WINDOW) {
      return { ok: false, value: this.ERR_NO_APPEAL };
    }
    this.state.appeals.set(applicationId, {
      reason,
      submittedAt: this.currentBlockHeight,
      resolved: false,
      resolver: caller,
    });
    return { ok: true, value: true };
  }

  resolveAppeal(
    caller: string,
    applicationId: number,
    newScore: number,
    appHandler: MockApplicationTrait
  ): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    const appeal = this.state.appeals.get(applicationId);
    if (!appeal) {
      return { ok: false, value: this.ERR_NO_APPEAL };
    }
    if (appeal.resolved) {
      return { ok: false, value: this.ERR_APPEAL_EXISTS };
    }
    const scoreEntry = this.state.eligibilityScores.get(applicationId);
    if (!scoreEntry) {
      return { ok: false, value: this.ERR_INVALID_APPLICATION };
    }
    if (newScore < 0 || newScore > 100) {
      return { ok: false, value: this.ERR_INVALID_SCORE };
    }
    this.state.eligibilityScores.set(applicationId, { ...scoreEntry, score: newScore });
    this.state.appeals.set(applicationId, { ...appeal, resolved: true, resolver: caller });

    const qualifies = newScore >= this.MIN_SCORE_THRESHOLD;
    // Log audit
    const verId = this.state.totalVerifications + 1;
    this.state.auditTrail.set(verId, {
      applicationId,
      farmer: appeal.resolver,
      score: newScore,
      timestamp: this.currentBlockHeight,
      outcome: qualifies,
    });
    this.state.totalVerifications = verId;

    appHandler.updateApplicationStatus(applicationId, qualifies ? "APPROVED" : "REJECTED");

    return { ok: true, value: qualifies };
  }

  getEligibilityScore(applicationId: number): ClarityResponse<ScoreEntry | null> {
    return { ok: true, value: this.state.eligibilityScores.get(applicationId) ?? null };
  }

  getAppealDetails(applicationId: number): ClarityResponse<Appeal | null> {
    return { ok: true, value: this.state.appeals.get(applicationId) ?? null };
  }

  getAuditEntry(verificationId: number): ClarityResponse<AuditEntry | null> {
    return { ok: true, value: this.state.auditTrail.get(verificationId) ?? null };
  }

  getSystemStatus(): ClarityResponse<SystemStatus> {
    return {
      ok: true,
      value: {
        paused: this.state.systemPaused,
        admin: this.state.admin,
        oracle: this.state.oracle,
        totalVerifications: this.state.totalVerifications,
        fee: this.state.verificationFee,
      },
    };
  }

  isQualified(applicationId: number): boolean {
    const entry = this.state.eligibilityScores.get(applicationId);
    return entry ? entry.score >= this.MIN_SCORE_THRESHOLD : false;
  }
}

// Test setup
const accounts = {
  admin: "admin",
  farmer1: "farmer1",
  unauthorized: "unauthorized",
};

describe("VerificationEngine Contract", () => {
  let contract: VerificationEngineMock;
  let farmStorage: MockFarmDataTrait;
  let criteriaContract: MockCriteriaTrait;
  let oracleContract: MockOracleTrait;
  let appHandler: MockApplicationTrait;

  beforeEach(() => {
    contract = new VerificationEngineMock();
    farmStorage = new MockFarmDataTrait();
    criteriaContract = new MockCriteriaTrait();
    oracleContract = new MockOracleTrait();
    appHandler = new MockApplicationTrait();
    vi.resetAllMocks();
  });

  it("should allow admin to set oracle", () => {
    const result = contract.setOracle(accounts.admin, "new-oracle");
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getSystemStatus().value.oracle).toBe("new-oracle");
  });

  it("should prevent non-admin from setting oracle", () => {
    const result = contract.setOracle(accounts.unauthorized, "new-oracle");
    expect(result).toEqual({ ok: false, value: 100 });
  });

  it("should pause and unpause system by admin", () => {
    let result = contract.pauseSystem(accounts.admin);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getSystemStatus().value.paused).toBe(true);

    result = contract.unpauseSystem(accounts.admin);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getSystemStatus().value.paused).toBe(false);
  });

  it("should prevent non-admin from pausing system", () => {
    const result = contract.pauseSystem(accounts.unauthorized);
    expect(result).toEqual({ ok: false, value: 100 });
  });

  it("should verify eligibility successfully", () => {
    appHandler.setInitialStatus(1, 1);

    const result = contract.verifyEligibility(
      accounts.farmer1,
      1,
      1,
      farmStorage,
      criteriaContract,
      oracleContract,
      appHandler
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBeGreaterThanOrEqual(70); // Based on mock data

    const score = contract.getEligibilityScore(1);
    expect(score.value?.score).toBeDefined();

    const audit = contract.getAuditEntry(1);
    expect(audit.value?.outcome).toBe(true);

    const status = appHandler.getApplicationStatus(1);
    expect(status.value?.status).toBe("APPROVED");
  });

  it("should fail verification if criteria not met", () => {
    vi.spyOn(farmStorage, "getFarmData").mockReturnValueOnce({
      ok: true,
      value: {
        landSize: 30, // Below min 40
        cropType: "Rice", // Not in required
        yieldHistory: [80, 90, 85, 95, 88], // Avg <100
        gps: Buffer.from("mockgps"),
        owner: "farmer1",
      },
    });
    appHandler.setInitialStatus(1, 1);

    const result = contract.verifyEligibility(
      accounts.farmer1,
      1,
      1,
      farmStorage,
      criteriaContract,
      oracleContract,
      appHandler
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(103);

    const status = appHandler.getApplicationStatus(1);
    expect(status.value?.status).toBe("REJECTED");
  });

  it("should fail verification if system paused", () => {
    contract.pauseSystem(accounts.admin);
    appHandler.setInitialStatus(1, 1);

    const result = contract.verifyEligibility(
      accounts.farmer1,
      1,
      1,
      farmStorage,
      criteriaContract,
      oracleContract,
      appHandler
    );
    expect(result).toEqual({ ok: false, value: 108 });
  });

  it("should fail verification if caller not owner", () => {
    vi.spyOn(farmStorage, "getFarmData").mockReturnValueOnce({
      ok: true,
      value: {
        landSize: 50,
        cropType: "Corn",
        yieldHistory: [100, 120, 110, 130, 115],
        gps: Buffer.from("mockgps"),
        owner: "farmer2", // Different from caller
      },
    });
    appHandler.setInitialStatus(1, 1);

    const result = contract.verifyEligibility(
      accounts.farmer1,
      1,
      1,
      farmStorage,
      criteriaContract,
      oracleContract,
      appHandler
    );
    expect(result).toEqual({ ok: false, value: 100 });
  });

  it("should allow appeal submission", () => {
    appHandler.setInitialStatus(1, 1);
    contract.verifyEligibility(accounts.farmer1, 1, 1, farmStorage, criteriaContract, oracleContract, appHandler);

    const result = contract.submitAppeal(accounts.farmer1, 1, "Incorrect yield data");
    expect(result).toEqual({ ok: true, value: true });

    const appeal = contract.getAppealDetails(1);
    expect(appeal.value?.reason).toBe("Incorrect yield data");
    expect(appeal.value?.resolved).toBe(false);
  });

  it("should prevent appeal if one exists", () => {
    appHandler.setInitialStatus(1, 1);
    contract.verifyEligibility(accounts.farmer1, 1, 1, farmStorage, criteriaContract, oracleContract, appHandler);
    contract.submitAppeal(accounts.farmer1, 1, "First appeal");

    const result = contract.submitAppeal(accounts.farmer1, 1, "Second appeal");
    expect(result).toEqual({ ok: false, value: 105 });
  });

  it("should allow admin to resolve appeal", () => {
    appHandler.setInitialStatus(1, 1);
    contract.verifyEligibility(accounts.farmer1, 1, 1, farmStorage, criteriaContract, oracleContract, appHandler);
    contract.submitAppeal(accounts.farmer1, 1, "Incorrect yield data");

    const result = contract.resolveAppeal(accounts.admin, 1, 75, appHandler);
    expect(result).toEqual({ ok: true, value: true });

    const score = contract.getEligibilityScore(1);
    expect(score.value?.score).toBe(75);

    const appeal = contract.getAppealDetails(1);
    expect(appeal.value?.resolved).toBe(true);

    const status = appHandler.getApplicationStatus(1);
    expect(status.value?.status).toBe("APPROVED");
  });

  it("should prevent non-admin from resolving appeal", () => {
    appHandler.setInitialStatus(1, 1);
    contract.verifyEligibility(accounts.farmer1, 1, 1, farmStorage, criteriaContract, oracleContract, appHandler);
    contract.submitAppeal(accounts.farmer1, 1, "Incorrect yield data");

    const result = contract.resolveAppeal(accounts.unauthorized, 1, 75, appHandler);
    expect(result).toEqual({ ok: false, value: 100 });
  });
});