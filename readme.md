# Dead Drop - Chia sẻ file tự hủy

## Tổng quan

Dead Drop là ứng dụng chia sẻ file tự hủy, mã hóa đầu cuối AES-256-GCM. File được mã hóa hoàn toàn ở phía trình duyệt, khóa giải mã không bao giờ chạm tới server. File tự hủy sau khi đạt đủ số lần đọc hoặc hết thời gian sống, mọi bằng chứng giao nhận đều được lưu bất biến trên blockchain Aptos.

## Cách hoạt động

**1. Người gửi tạo Dead Drop**
- Chọn file (tối đa 100MB)
- Cài đặt số lần đọc tối đa (1-10)
- Cài đặt thời gian sống (1-168 giờ)
- Trình duyệt tạo khóa AES-256-GCM ngẫu nhiên
- File được mã hóa bằng khóa + IV, chỉ có bản mã được gửi lên server

**2. Upload và ghi blockchain**
- Bản mã được gửi lên Shelby Protocol để lưu trữ
- Hash SHA-256 của bản mã được tính
- Gọi smart contract trên Aptos để đăng ký drop với các thông tin: blob hash, chủ sở hữu, TTL, số lần đọc tối đa
- Tạo link chia sẻ dạng: `http://domain.com/drop/{id}#key={khóa_gốc}`

**3. Người nhận tải file**
- Mở link, khóa nằm trong URL fragment (`#key=...`), không bao giờ gửi lên server
- Frontend lấy khóa từ trình duyệt
- Kiểm tra trạng thái drop trên blockchain (còn hạn? còn lượt đọc?)
- Nếu còn hiệu lực, lấy bản mã từ Shelby
- So sánh hash của bản mã với hash đã lưu trên blockchain để xác minh toàn vẹn
- Giải mã file bằng khóa từ URL
- Ghi nhận lượt đọc lên blockchain (giảm quota, phát sinh event)

**4. Tự hủy**
- Hết số lần đọc: file tự động xóa khỏi Shelby
- Hết thời gian sống: drop không còn hiệu lực
- Chủ sở hữu có thể tự hủy thủ công

## Kiến trúc

**Frontend (Next.js 14)**
- Giao diện upload file
- Giao diện tải file
- Trang kiểm tra trạng thái
- Mã hóa/giải mã client-side bằng Web Crypto API

**API Routes (Next.js)**
- `POST /api/upload` - Nhận file mã hóa, upload lên Shelby, ghi blockchain
- `GET /api/read/{id}` - Lấy bản mã, xác minh hash, trả file giải mã
- `GET /api/status/{id}` - Kiểm tra trạng thái drop

**Shelby Protocol**
- Lưu trữ blob phân tán
- Upload/Download blob theo quota
- Tự động xóa blob khi hết quota hoặc TTL

**Aptos Blockchain**
- Smart contract Move
- Lưu metadata drop: blob hash, owner, TTL, max reads, reads remaining
- Phát sinh events làm bằng chứng không thể chối cãi

**Lớp mã hóa**
- AES-256-GCM
- Khóa sinh ngẫu nhiên cho mỗi file
- IV sinh ngẫu nhiên cho mỗi file
- Key chỉ nằm trong URL fragment

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|------------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript |
| UI | TailwindCSS, Lucide Icons |
| Blockchain | Aptos (Move) |
| Storage | Shelby Protocol |
| Mã hóa | Web Crypto API (AES-256-GCM) |
| Wallet | Aptos Wallet Adapter |

## Smart Contract (Move)

**Cấu trúc Drop**

```move
struct Drop has store, drop {
    blob_id: String,
    blob_hash: String,
    owner: address,
    ttl_seconds: u64,
    created_at: u64,
    max_reads: u64,
    reads_remaining: u64,
    is_active: bool,
}


Các hàm chính

Hàm	Mô tả
register_drop	Tạo drop mới
record_read	Ghi nhận lượt đọc, giảm quota
destroy_drop	Hủy drop thủ công
get_drop_status	Xem trạng thái (view function)
get_blob_hash	Lấy hash để xác minh (view function)
Events

Event	Mô tả
DropCreatedEvent	Phát sinh khi tạo drop
DropReadEvent	Phát sinh mỗi lần đọc (bằng chứng giao nhận)
DropDestroyedEvent	Phát sinh khi drop tự hủy
Bảo mật

Mối đe dọa	Cách xử lý
Key bị chặn	Key chỉ nằm trong URL fragment, không gửi lên server
Server đọc plaintext	Server chỉ lưu bản mã, không có key
File bị sửa đổi	Hash SHA-256 lưu trên blockchain, verify trước khi giải mã
Tấn công replay	Hệ thống quota + ghi nhận trên blockchain
Truy cập trái phép	Xác thực bằng ví Aptos khi tạo drop
Dữ liệu tồn tại vĩnh viễn	Tự động xóa khỏi storage khi hết quota hoặc TTL

