import { Type, type FunctionDeclaration } from '@google/genai';

/**
 * Tool definitions for Gemini AI Agent (function calling)
 */

export const TOOLS: FunctionDeclaration[] = [
  {
    name: 'checkRoomAvailability',
    description: 'ตรวจสอบความว่างของห้องพักและราคา จากระบบจองห้อง Cloudbeds',
    parameters: {
      type: Type.OBJECT,
      properties: {
        roomType: {
          type: Type.STRING,
          enum: ['Superior', 'Sriwilai Suite', 'Deluxe'],
          description: 'หมวดหมู่ห้องพัก มี 3 แบบเท่านั้น: "Superior", "Sriwilai Suite", "Deluxe"',
        },
        checkInDate: {
          type: Type.STRING,
          description: 'วันเข้าพัก รูปแบบ YYYY-MM-DD เช่น "2026-09-04"',
        },
        nights: {
          type: Type.NUMBER,
          description: 'จำนวนคืนที่ต้องการพัก (1-30)',
        },
      },
      required: ['roomType', 'checkInDate', 'nights'],
    },
  },
  {
    name: 'getRoomDetails',
    description: 'ดึงรายละเอียดห้องพัก เช่น สิ่งอำนวยความสะดวก จำนวนผู้เข้าพักสูงสุด จากระบบ Cloudbeds',
    parameters: {
      type: Type.OBJECT,
      properties: {
        roomType: {
          type: Type.STRING,
          enum: ['Superior', 'Sriwilai Suite', 'Deluxe'],
          description: 'หมวดหมู่ห้องพัก มี 3 แบบเท่านั้น: "Superior", "Sriwilai Suite", "Deluxe"',
        },
      },
      required: ['roomType'],
    },
  },
  {
    name: 'searchTouristInfo',
    description: 'ค้นหาข้อมูลสถานที่ท่องเที่ยว ร้านอาหาร ในจังหวัดสุโขทัย โดยใช้ Google Places',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'คำค้นหา เช่น "วัดพระแรม", "ร้านข้าวมันไก่", "ที่เที่ยวสุโขทัย"',
        },
      },
      required: ['query'],
    },
  },
];
