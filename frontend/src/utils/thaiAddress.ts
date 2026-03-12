import addressData from '../data/thai-addresses.json';

export interface ThaiAddress {
  district: string;   // ตำบล/แขวง
  amphoe: string;     // อำเภอ/เขต
  province: string;   // จังหวัด
  zipcode: string;    // รหัสไปรษณีย์
}

// Data format: [district, amphoe, province, zipcode][]
const addresses: ThaiAddress[] = (addressData as string[][]).map(([d, a, p, z]) => ({
  district: d, amphoe: a, province: p, zipcode: z,
}));

export function searchByZipcode(zipcode: string): ThaiAddress[] {
  if (!zipcode || zipcode.length < 5) return [];
  return addresses.filter((a) => a.zipcode === zipcode);
}

export function searchByDistrict(query: string): ThaiAddress[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return addresses.filter((a) => a.district.includes(q)).slice(0, 20);
}
