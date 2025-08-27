# 🌾 Decentralized Subsidy Distribution System

Welcome to a transparent and corruption-resistant way to distribute agricultural subsidies! This project uses the Stacks blockchain and Clarity smart contracts to verify farmer eligibility based on on-chain farm data, ensuring fair allocation of funds and reducing opportunities for fraud or favoritism in government or organizational subsidy programs.

## ✨ Features

🔍 On-chain verification of farm data for eligibility checks  
💰 Automated subsidy distribution to qualified farmers  
📊 Immutable records of applications, approvals, and payouts  
🚫 Anti-corruption measures like tamper-proof data and transparent audits  
👥 Multi-role support for farmers, verifiers, and administrators  
🔄 Integration with oracles for real-time external data (e.g., crop yields or weather)  
📈 Scalable system with 8 smart contracts for modular functionality  

## 🛠 How It Works

This system involves 8 Clarity smart contracts working together to handle registration, data storage, verification, and distribution. Farmers upload verifiable farm data (e.g., land size, crop types, yield history) to the blockchain, which is used to automatically determine subsidy eligibility based on predefined criteria (e.g., smallholder status, sustainable practices). Subsidies are distributed in STX or custom tokens, with all actions logged immutably.

### Key Smart Contracts
1. **FarmerRegistry.clar**: Registers farmers with unique IDs, wallet addresses, and basic profiles. Prevents duplicate registrations.  
2. **FarmDataStorage.clar**: Stores hashed farm data (e.g., land deeds, GPS coordinates, crop details) submitted by farmers, ensuring immutability.  
3. **EligibilityCriteria.clar**: Defines and updates subsidy rules (e.g., min land size, max income) via governance votes.  
4. **ApplicationHandler.clar**: Allows farmers to submit subsidy applications, linking to their on-chain farm data.  
5. **VerificationEngine.clar**: Automatically verifies eligibility by cross-checking farm data against criteria; integrates with oracles for external validation.  
6. **SubsidyPool.clar**: Manages the pool of funds (deposited by governments or organizations) and queues approved payouts.  
7. **DistributionExecutor.clar**: Executes token transfers to approved farmers and logs transactions for transparency.  
8. **AuditLogger.clar**: Records all system events for auditing, enabling public queries to detect anomalies.

**For Farmers**  
- Register your profile using FarmerRegistry.  
- Upload verifiable farm data (e.g., hashed documents) to FarmDataStorage.  
- Submit an application via ApplicationHandler.  
- The VerificationEngine checks your data against EligibilityCriteria—if approved, funds are released through DistributionExecutor.  

Boom! Receive subsidies directly to your wallet without intermediaries.  

**For Verifiers/Administrators**  
- Use AuditLogger to review logs and detect fraud.  
- Update rules in EligibilityCriteria through secure governance calls.  
- Monitor the SubsidyPool for fund levels and trigger distributions.  

**For Auditors/Public**  
- Query any contract (e.g., get-application-status in ApplicationHandler) for transparent verification.  
- Verify ownership and data integrity instantly via on-chain proofs.  

That's it! A decentralized solution that empowers small farmers while minimizing corruption through blockchain transparency.