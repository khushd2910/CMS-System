// SAMPLE location data so the State -> District -> City / Taluka dropdowns work.
// Replace with the full official list (or an API) before going live.
// Shape: { State: { District: ["City / Taluka", ...] } }
export const LOCATIONS = {
  Gujarat: {
    Ahmedabad: ["Ahmedabad City", "Daskroi", "Sanand", "Dholka", "Viramgam"],
    Gandhinagar: ["Gandhinagar", "Kalol", "Mansa", "Dehgam"],
    Rajkot: ["Rajkot City", "Gondal", "Jetpur", "Morbi"],
    Surat: ["Surat City", "Bardoli", "Kamrej", "Olpad"],
    Vadodara: ["Vadodara City", "Padra", "Karjan", "Savli"],
  },
  Maharashtra: {
    Mumbai: ["Mumbai City", "Andheri", "Borivali"],
    Pune: ["Pune City", "Haveli", "Baramati", "Mulshi"],
    Nagpur: ["Nagpur City", "Kamptee", "Hingna"],
  },
  Rajasthan: {
    Jaipur: ["Jaipur City", "Sanganer", "Amer"],
    Udaipur: ["Udaipur City", "Girwa", "Mavli"],
  },
  Delhi: {
    "New Delhi": ["Connaught Place", "Chanakyapuri", "Delhi Cantonment"],
    "South Delhi": ["Saket", "Hauz Khas", "Mehrauli"],
  },
};
