// Preview page for testing Verify screen design
export default function VerifyScreenPreview() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto bg-white min-h-screen p-4">
        {/* Blue Header Section */}
        <div className="bg-gradient-to-b from-blue-700 to-blue-600 rounded-2xl text-white p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">🛡️</span>
            <div className="text-lg font-bold">TechWheels Care</div>
          </div>
          <p className="text-sm opacity-90 mb-4">Service feedback for</p>
          
          {/* Vehicle Info Card within header */}
          <div className="bg-blue-600/40 backdrop-blur rounded-2xl p-4 border border-white/25">
            <div className="text-xl font-bold mb-2">RJ59CA2700</div>
            <p className="text-sm opacity-95 leading-relaxed">
              Tiago EV • Running Repairs
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Not happy with your service?
          </h1>
          <p className="text-gray-600 text-sm mb-6 leading-relaxed">
            We're sorry if your visit at <span className="font-semibold">Sitapura</span> on 06 Jun 2026 didn't go as expected. Raise a complaint and our team will personally resolve it.
          </p>

          {/* Value Props - Icon list style matching reference */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m7.5-2.499A9 9 0 1012 21a9 9 0 007.5-10.499z" />
                </svg>
              </div>
              <span className="text-gray-700 font-semibold text-sm">This link is unique to your vehicle visit</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-gray-700 font-semibold text-sm">Goes straight to your advisor, Arjhant Jain</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-gray-700 font-semibold text-sm">Track the resolution live on this same link</span>
            </div>
          </div>

          {/* CTA Button */}
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all min-h-12 text-base font-medium mb-3">
            Raise a complaint
          </button>

          <p className="text-xs text-gray-600 text-center">
            Just visiting? You can also view past requests here.
          </p>
        </div>
      </div>
    </div>
  );
}
