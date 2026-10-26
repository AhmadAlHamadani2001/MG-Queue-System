import type { Metadata } from "next";

// Public privacy policy. Required by Meta to switch the WhatsApp app to
// Live mode, and by Apple for the App Store listing.
export const metadata: Metadata = {
  title: "Privacy Policy · MG Queue",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-mg-cream px-5 py-10">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-black/5 p-6 space-y-8 text-mg-ink">
        <section dir="ltr" className="space-y-3 text-sm leading-6">
          <h1 className="text-2xl font-bold">Privacy Policy — MG Queue</h1>
          <p>
            MG Queue is the service queue system of Jiad Modern Motors for MG after-sales branches in Saudi Arabia.
          </p>
          <h2 className="font-semibold text-base">What we collect</h2>
          <ul className="list-disc ps-5 space-y-1">
            <li>Your name, mobile number and visit details, entered when you take a queue ticket.</li>
            <li>
              If you choose WhatsApp alerts: your WhatsApp number and the message you send us, used only to link your
              WhatsApp to your ticket.
            </li>
            <li>
              If you allow notifications: a technical device/browser token so we can alert you when it&apos;s your turn.
            </li>
          </ul>
          <h2 className="font-semibold text-base">How we use it</h2>
          <p>
            Only to run your service visit: show your place in the queue and notify you when it&apos;s your turn. We do
            not sell your data or send marketing messages.
          </p>
          <h2 className="font-semibold text-base">Sharing</h2>
          <p>
            Data is stored with our hosting providers (Supabase, Vercel). Notifications are delivered through Apple,
            Google or Meta (WhatsApp) only to reach you.
          </p>
          <h2 className="font-semibold text-base">Your choices</h2>
          <p>
            You can turn off notifications in your phone settings or stop WhatsApp alerts by blocking the number. To ask
            for your data to be deleted, contact the branch or Jiad Modern Motors customer service.
          </p>
        </section>

        <hr className="border-black/10" />

        <section dir="rtl" className="space-y-3 text-sm leading-7">
          <h1 className="text-2xl font-bold">سياسة الخصوصية — MG Queue</h1>
          <p>MG Queue هو نظام طابور الخدمة لشركة جياد الحديثة للسيارات في فروع خدمة ما بعد البيع لسيارات إم جي في المملكة العربية السعودية.</p>
          <h2 className="font-semibold text-base">ما الذي نجمعه</h2>
          <ul className="list-disc ps-5 space-y-1">
            <li>اسمك ورقم جوالك وتفاصيل زيارتك عند أخذ تذكرة الانتظار.</li>
            <li>عند اختيار تنبيهات واتساب: رقم واتساب والرسالة التي ترسلها لنا، لربط واتساب بتذكرتك فقط.</li>
            <li>عند السماح بالإشعارات: رمز تقني للجهاز أو المتصفح لتنبيهك عند حلول دورك.</li>
          </ul>
          <h2 className="font-semibold text-base">كيف نستخدمها</h2>
          <p>فقط لخدمة زيارتك: عرض ترتيبك في الطابور وتنبيهك عند حلول دورك. لا نبيع بياناتك ولا نرسل رسائل تسويقية.</p>
          <h2 className="font-semibold text-base">المشاركة</h2>
          <p>تُحفظ البيانات لدى مزودي الاستضافة (Supabase وVercel). تُرسل الإشعارات عبر Apple أو Google أو Meta (واتساب) فقط للوصول إليك.</p>
          <h2 className="font-semibold text-base">خياراتك</h2>
          <p>يمكنك إيقاف الإشعارات من إعدادات جوالك أو إيقاف تنبيهات واتساب بحظر الرقم. لطلب حذف بياناتك تواصل مع الفرع أو خدمة عملاء جياد الحديثة للسيارات.</p>
        </section>
      </div>
    </main>
  );
}
