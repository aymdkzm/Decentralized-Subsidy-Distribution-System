;; VerificationEngine.clar
;; Core contract for verifying farmer eligibility in the Decentralized Subsidy Distribution System.
;; This contract cross-references on-chain farm data against eligibility criteria,
;; integrates with oracles for external validation (e.g., weather, yield data),
;; and determines subsidy qualification with a scoring system to ensure fairness.
;; It supports multi-factor verification, appeal processes, and audit trails.

;; Constants
(define-constant ERR_NOT_AUTHORIZED u100)
(define-constant ERR_INVALID_FARMER u101)
(define-constant ERR_INVALID_APPLICATION u102)
(define-constant ERR_CRITERIA_NOT_MET u103)
(define-constant ERR_ORACLE_FAILURE u104)
(define-constant ERR_APPEAL_EXISTS u105)
(define-constant ERR_NO_APPEAL u106)
(define-constant ERR_INVALID_SCORE u107)
(define-constant ERR_SYSTEM_PAUSED u108)
(define-constant ERR_INVALID_DATA u109)
(define-constant MIN_SCORE_THRESHOLD u70) ;; Minimum score out of 100 to qualify
(define-constant MAX_APPEAL_WINDOW u144) ;; 144 blocks ~1 day

;; Traits for dependencies
(define-trait farm-data-trait
  (
    (get-farm-data (uint) (response {land-size: uint, crop-type: (string-utf8 50), yield-history: (list 5 uint), gps: (buff 32), owner: principal} uint))
  )
)

(define-trait criteria-trait
  (
    (get-current-criteria () (response {min-land-size: uint, required-crops: (list 10 (string-utf8 50)), min-yield: uint, sustainability-score: uint} uint))
  )
)

(define-trait oracle-trait
  (
    (get-external-data (uint) (response {weather-impact: uint, market-price: uint, verified-yield: uint} uint))
  )
)

(define-trait application-trait
  (
    (get-application-status (uint) (response {status: (string-utf8 20), farmer-id: uint} uint))
    (update-application-status (uint (string-utf8 20)) (response bool uint))
  )
)

;; Data Variables
(define-data-var oracle principal tx-sender) ;; Oracle contract principal
(define-data-var system-paused bool false)
(define-data-var admin principal tx-sender)
(define-data-var total-verifications uint u0)
(define-data-var verification-fee uint u100) ;; Microstacks fee for verification

;; Data Maps
(define-map eligibility-scores
  { application-id: uint }
  { score: uint, verified-at: uint, factors: (list 5 {factor: (string-utf8 50), points: uint}) }
)

(define-map appeals
  { application-id: uint }
  { reason: (string-utf8 200), submitted-at: uint, resolved: bool, resolver: principal }
)

(define-map audit-trail
  { verification-id: uint }
  { application-id: uint, farmer: principal, score: uint, timestamp: uint, outcome: bool }
)

;; Private Functions
(define-private (calculate-score (farm-data {land-size: uint, crop-type: (string-utf8 50), yield-history: (list 5 uint), gps: (buff 32), owner: principal})
                                 (criteria {min-land-size: uint, required-crops: (list 10 (string-utf8 50)), min-yield: uint, sustainability-score: uint})
                                 (oracle-data {weather-impact: uint, market-price: uint, verified-yield: uint}))
  (let
    (
      (land-points (if (>= (get land-size farm-data) (get min-land-size criteria)) u30 u0))
      (crop-points (if (is-some (index-of? (get required-crops criteria) (get crop-type farm-data))) u20 u0))
      (yield-points (if (>= (fold + (get yield-history farm-data) u0) (* (len (get yield-history farm-data)) (get min-yield criteria))) u20 u0))
      (sustainability-points (get sustainability-score criteria)) ;; Placeholder, could be calculated
      (oracle-adjustment (/ (+ (get weather-impact oracle-data) (get market-price oracle-data) (get verified-yield oracle-data)) u3))
      (total (+ land-points crop-points yield-points sustainability-points oracle-adjustment))
    )
    (if (> total u100) u100 total)
  )
)

(define-private (log-audit (application-id uint) (farmer principal) (score uint) (outcome bool))
  (let
    (
      (ver-id (+ (var-get total-verifications) u1))
    )
    (map-set audit-trail {verification-id: ver-id} {application-id: application-id, farmer: farmer, score: score, timestamp: block-height, outcome: outcome})
    (var-set total-verifications ver-id)
    ver-id
  )
)

;; Public Functions
(define-public (set-oracle (new-oracle principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR_NOT_AUTHORIZED))
    (ok (var-set oracle new-oracle))
  )
)

(define-public (pause-system)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR_NOT_AUTHORIZED))
    (ok (var-set system-paused true))
  )
)

(define-public (unpause-system)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR_NOT_AUTHORIZED))
    (ok (var-set system-paused false))
  )
)

(define-public (verify-eligibility (farmer-id uint) (application-id uint)
                                   (farm-storage <farm-data-trait>) (criteria-contract <criteria-trait>)
                                   (oracle-contract <oracle-trait>) (app-handler <application-trait>))
  (begin
    (asserts! (not (var-get system-paused)) (err ERR_SYSTEM_PAUSED))
    ;; Charge fee if applicable
    (try! (stx-transfer? (var-get verification-fee) tx-sender (as-contract tx-sender)))
    (let
      (
        (farm-data (unwrap! (contract-call? farm-storage get-farm-data farmer-id) (err ERR_INVALID_DATA)))
        (criteria (unwrap! (contract-call? criteria-contract get-current-criteria) (err ERR_INVALID_DATA)))
        (oracle-data (unwrap! (contract-call? oracle-contract get-external-data farmer-id) (err ERR_ORACLE_FAILURE)))
        (app-status (unwrap! (contract-call? app-handler get-application-status application-id) (err ERR_INVALID_APPLICATION)))
        (score (calculate-score farm-data criteria oracle-data))
        (factors (list
          {factor: "Land Size", points: (if (>= (get land-size farm-data) (get min-land-size criteria)) u30 u0)}
          {factor: "Crop Type", points: (if (is-some (index-of? (get required-crops criteria) (get crop-type farm-data))) u20 u0)}
          {factor: "Yield History", points: (if (>= (fold + (get yield-history farm-data) u0) (* (len (get yield-history farm-data)) (get min-yield criteria))) u20 u0)}
          {factor: "Sustainability", points: (get sustainability-score criteria)}
          {factor: "Oracle Adjustment", points: (/ (+ (get weather-impact oracle-data) (get market-price oracle-data) (get verified-yield oracle-data)) u3)}
        ))
        (qualifies (>= score MIN_SCORE_THRESHOLD))
      )
      (asserts! (is-eq (get owner farm-data) tx-sender) (err ERR_NOT_AUTHORIZED))
      (asserts! (is-eq (get farmer-id app-status) farmer-id) (err ERR_INVALID_FARMER))
      (map-set eligibility-scores {application-id: application-id} {score: score, verified-at: block-height, factors: factors})
      (log-audit application-id tx-sender score qualifies)
      (try! (contract-call? app-handler update-application-status application-id (if qualifies "APPROVED" "REJECTED")))
      (if qualifies
        (ok score)
        (err ERR_CRITERIA_NOT_MET)
      )
    )
  )
)

(define-public (submit-appeal (application-id uint) (reason (string-utf8 200)))
  (let
    (
      (existing-appeal (map-get? appeals {application-id: application-id}))
      (score-entry (map-get? eligibility-scores {application-id: application-id}))
    )
    (asserts! (is-none existing-appeal) (err ERR_APPEAL_EXISTS))
    (asserts! (is-some score-entry) (err ERR_INVALID_APPLICATION))
    (asserts! (< (- block-height (get verified-at (unwrap-panic score-entry))) MAX_APPEAL_WINDOW) (err ERR_NO_APPEAL))
    (map-set appeals {application-id: application-id} {reason: reason, submitted-at: block-height, resolved: false, resolver: tx-sender})
    (ok true)
  )
)

(define-public (resolve-appeal (application-id uint) (new-score uint) (app-handler <application-trait>))
  (let
    (
      (appeal (unwrap! (map-get? appeals {application-id: application-id}) (err ERR_NO_APPEAL)))
      (score-entry (unwrap! (map-get? eligibility-scores {application-id: application-id}) (err ERR_INVALID_APPLICATION)))
    )
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR_NOT_AUTHORIZED))
    (asserts! (not (get resolved appeal)) (err ERR_APPEAL_EXISTS))
    (asserts! (and (>= new-score u0) (<= new-score u100)) (err ERR_INVALID_SCORE))
    (map-set eligibility-scores {application-id: application-id} (merge score-entry {score: new-score}))
    (map-set appeals {application-id: application-id} (merge appeal {resolved: true, resolver: tx-sender}))
    (let ((qualifies (>= new-score MIN_SCORE_THRESHOLD)))
      (log-audit application-id (get resolver appeal) new-score qualifies)
      (try! (contract-call? app-handler update-application-status application-id (if qualifies "APPROVED" "REJECTED")))
      (ok qualifies)
    )
  )
)

;; Read-Only Functions
(define-read-only (get-eligibility-score (application-id uint))
  (map-get? eligibility-scores {application-id: application-id})
)

(define-read-only (get-appeal-details (application-id uint))
  (map-get? appeals {application-id: application-id})
)

(define-read-only (get-audit-entry (verification-id uint))
  (map-get? audit-trail {verification-id: verification-id})
)

(define-read-only (get-system-status)
  {
    paused: (var-get system-paused),
    admin: (var-get admin),
    oracle: (var-get oracle),
    total-verifications: (var-get total-verifications),
    fee: (var-get verification-fee)
  }
)

(define-read-only (is-qualified (application-id uint))
  (match (map-get? eligibility-scores {application-id: application-id})
    entry (>= (get score entry) MIN_SCORE_THRESHOLD)
    false
  )
)