export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">แดชบอร์ด</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'ลูกค้า', value: '-', color: 'bg-blue-500' },
          { label: 'สินค้า', value: '-', color: 'bg-green-500' },
          { label: 'วัตถุดิบ', value: '-', color: 'bg-yellow-500' },
          { label: 'ใบสั่งขาย', value: '-', color: 'bg-purple-500' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center text-white text-lg mb-3`}>
              {card.label[0]}
            </div>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold text-gray-800">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
