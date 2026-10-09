import { verifyPassword } from "./security.js";
export async function productionChecks(pool) {
  const [rows] = await pool.execute(
    "SELECT email,password_hash FROM users WHERE status='active'",
  );
  const demos = {
    "khach@n01sport.vn": "Khach@123",
    "chusan@n01sport.vn": "ChuSan@123",
    "letan@n01sport.vn": "LeTan@123",
    "admin@n01sport.vn": "Admin@123",
    "kythuat@n01sport.vn": "KyThuat@123",
    "vesinh@n01sport.vn": "VeSinh@123",
    "hlv@n01sport.vn": "HLV@12345",
  };
  const insecure = rows.filter(
    (u) => demos[u.email] && verifyPassword(demos[u.email], u.password_hash),
  );
  if (insecure.length)
    throw new Error(
      "Còn tài khoản demo dùng mật khẩu mặc định: " +
        insecure.map((u) => u.email).join(", ") +
        ". Đổi mật khẩu hoặc khóa trước khi chạy production.",
    );
  if (
    !process.env.SEPAY_WEBHOOK_KEY ||
    process.env.SEPAY_WEBHOOK_KEY.length < 24
  )
    throw new Error("SEPAY_WEBHOOK_KEY cần tối thiểu 24 ký tự ngẫu nhiên.");
  if (
    [process.env.DB_PASSWORD, process.env.SEPAY_WEBHOOK_KEY].some((s) =>
      s?.startsWith("CHANGE_"),
    )
  )
    throw new Error("Thay các giá trị CHANGE_ trong cấu hình production.");
  if (String(process.env.DB_PASSWORD).length < 16)
    throw new Error("Mật khẩu database production cần ít nhất 16 ký tự.");
  if (
    !process.env.SMTP_HOST ||
    !(process.env.SMTP_FROM || process.env.SMTP_USER)
  )
    throw new Error(
      "Production cần SMTP_HOST và SMTP_FROM/SMTP_USER cho email và khôi phục mật khẩu.",
    );
}
