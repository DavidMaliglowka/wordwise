import { DocumentService } from '../services/firestore';
import { db } from '../lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { COLLECTIONS } from '../types/firestore';

const sampleTitles = [
  "Annual Marketing Strategy Report",
  "Q4 Sales Performance Analysis",
  "Customer Feedback Compilation",
  "Product Launch Proposal",
  "Team Meeting Minutes - Project Alpha",
  "Budget Allocation Guidelines",
  "Market Research Findings",
  "Employee Onboarding Process",
  "Technical Documentation Update",
  "Brand Guidelines Revision",
  "Quarterly Business Review",
  "Social Media Content Strategy",
  "Partnership Agreement Draft",
  "Training Materials Development",
  "Competitive Analysis Report",
  "User Experience Improvement Plan",
  "Crisis Management Protocol",
  "Sustainability Initiative Proposal",
  "Remote Work Policy Update",
  "Innovation Workshop Summary",
  "Client Presentation Template",
  "Performance Metrics Dashboard",
  "Vendor Evaluation Criteria",
  "Product Roadmap Discussion",
  "Legal Compliance Checklist",
  "Data Security Assessment",
  "Customer Journey Mapping",
  "Revenue Optimization Strategy",
  "Quality Assurance Guidelines",
  "Knowledge Base Article",
  "Project Timeline Overview",
  "Resource Allocation Plan",
  "Market Penetration Analysis",
  "Digital Transformation Roadmap",
  "Supply Chain Optimization",
  "Customer Retention Strategies",
  "Technology Stack Evaluation",
  "Business Process Improvement",
  "Content Marketing Calendar",
  "Risk Assessment Framework",
  "Stakeholder Communication Plan",
  "Product Feature Specifications",
  "User Testing Results",
  "Pricing Strategy Analysis",
  "Operational Efficiency Review",
  "Team Performance Evaluation",
  "Strategic Planning Session",
  "Industry Trend Analysis",
  "Customer Success Stories",
  "Software Implementation Guide"
];

const sampleContent = [
  "This comprehensive document outlines our strategic approach to enhancing business operations through innovative methodologies. We've identified key areas for improvement including process optimization, resource allocation, and stakeholder engagement. The proposed timeline spans six months with clearly defined milestones and success metrics. Our research indicates significant potential for growth in this sector, supported by market analysis and customer feedback data.",
  "Following extensive analysis of our current market position, we recommend implementing a phased approach to digital transformation. This initiative will modernize our infrastructure while maintaining operational continuity. The expected benefits include improved efficiency, enhanced customer experience, and competitive advantage. Key stakeholders have been identified and engagement strategies developed to ensure smooth implementation.",
  "Our evaluation process has revealed several opportunities for cost optimization without compromising quality standards. The proposed changes address both immediate concerns and long-term sustainability goals. Implementation requires cross-departmental collaboration and executive support. Regular monitoring and adjustment mechanisms have been incorporated to track progress and ensure desired outcomes.",
  "This analysis presents findings from our comprehensive review of industry best practices and emerging trends. The data suggests significant opportunities for innovation and market expansion. We recommend prioritizing customer-centric solutions while maintaining focus on operational excellence. The proposed strategy aligns with corporate objectives and resource constraints.",
  "Based on extensive research and stakeholder consultations, we present this detailed framework for organizational improvement. The methodology incorporates proven strategies adapted to our specific context and requirements. Success depends on commitment from leadership and active participation from all team members. Timeline and budget considerations have been carefully evaluated and documented."
];

export async function createTestDocuments(uid: string, count: number = 50): Promise<void> {
  console.log(`Creating ${count} test documents for user ${uid}...`);

  try {
    for (let i = 0; i < count; i++) {
      const randomTitle = sampleTitles[Math.floor(Math.random() * sampleTitles.length)];
      const randomContent = sampleContent[Math.floor(Math.random() * sampleContent.length)];

      // Add some variation to make documents unique
      const title = `${randomTitle} ${i + 1}`;
      const content = `${randomContent}\n\nDocument ID: ${i + 1}\nCreated for testing infinite scroll functionality.`;

      // Create documents one by one to avoid overwhelming Firestore
      await DocumentService.createDocument({
        uid,
        title,
        content,
        contentType: 'blog',
        goals: [`Document ${i + 1} goals`, "Testing infinite scroll"],
        status: Math.random() > 0.8 ? 'draft' : 'published'
      });

      // Log progress every 10 documents
      if ((i + 1) % 10 === 0) {
        console.log(`Created ${i + 1} documents...`);
      }

      // Small delay to avoid rate limiting
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Successfully created ${count} test documents!`);
  } catch (error) {
    console.error('Error creating test documents:', error);
    throw error;
  }
}

// Quick helper to delete test documents (cleanup)
export async function deleteAllUserDocuments(uid: string): Promise<void> {
  console.log('Fetching all user documents for cleanup...');

  try {
    let hasMore = true;
    let totalDeleted = 0;

    while (hasMore) {
      const result = await DocumentService.getUserDocuments(uid, 20); // Smaller batches

      if (result.documents.length === 0) {
        hasMore = false;
        break;
      }

      // Delete documents one by one to avoid batch permission issues
      for (const doc of result.documents) {
        try {
          await DocumentService.deleteDocument(doc.id);
          totalDeleted++;

          // Log progress every 10 deletions
          if (totalDeleted % 10 === 0) {
            console.log(`Deleted ${totalDeleted} documents...`);
          }
        } catch (error) {
          console.warn(`Failed to delete document ${doc.id}:`, error);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      hasMore = result.hasMore;
    }

    console.log(`Cleanup complete! Deleted ${totalDeleted} total documents.`);
  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  }
}

// Simple test function to debug Firestore issues
export async function createSingleTestDocument(uid: string): Promise<void> {
  console.log(`Creating single test document for user ${uid}...`);

  try {
    const testDocument = {
      uid,
      title: "Test Document",
      content: "This is a simple test document to verify Firestore is working correctly.",
      contentType: 'blog' as const,
      status: 'draft' as const
    };

    console.log('Document data:', testDocument);

    const docId = await DocumentService.createDocument(testDocument);
    console.log(`Successfully created test document with ID: ${docId}`);
  } catch (error) {
    console.error('Error creating single test document:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw error;
  }
}

// Simple delete function that only deletes documents (no related collections)
export async function simpleDeleteAllDocuments(uid: string): Promise<void> {
  console.log('Fetching all user documents for simple cleanup...');

  try {
    let hasMore = true;
    let totalDeleted = 0;

    while (hasMore) {
      const result = await DocumentService.getUserDocuments(uid, 20);

      if (result.documents.length === 0) {
        hasMore = false;
        break;
      }

      // Delete documents one by one using simple deleteDoc
      for (const document of result.documents) {
        try {
          const docRef = doc(db, COLLECTIONS.DOCUMENTS, document.id);
          await deleteDoc(docRef);
          totalDeleted++;

          if (totalDeleted % 10 === 0) {
            console.log(`Deleted ${totalDeleted} documents...`);
          }
        } catch (error) {
          console.warn(`Failed to delete document ${document.id}:`, error);
        }

        // Small delay
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      hasMore = result.hasMore;
    }

    console.log(`Simple cleanup complete! Deleted ${totalDeleted} total documents.`);
  } catch (error) {
    console.error('Error during simple cleanup:', error);
    throw error;
  }
}
