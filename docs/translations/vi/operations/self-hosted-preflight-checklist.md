# Danh sách kiểm tra trước khi cài đặt và chạy thử hệ thống tự lưu trữ

## Mục đích

Xác định danh sách kiểm tra trước khi vận hành và các bài thử cơ bản dành cho bản triển khai Lattice tự lưu trữ trong doanh nghiệp.

Tài liệu này trả lời câu hỏi thực tế:

## “Làm sao biết bản cài đặt mới có thực sự sử dụng được?”

Nên dùng tài liệu này khi:
- cài đặt lần đầu cho doanh nghiệp
- xác nhận bản triển khai
- xác nhận sau nâng cấp
- phân loại và xử lý sự cố hỗ trợ

---

## Hai lớp xác minh

### Lớp 1 — Kiểm tra trước khi vận hành
Kiểm tra cấu hình và khả năng kết nối dịch vụ trước khi sử dụng bình thường.

Ví dụ:
- có đủ biến môi trường
- truy cập được cơ sở dữ liệu
- truy cập được bộ lưu trữ
- đã cấu hình xác thực
- có đầy đủ thông tin bí mật cần thiết

### Lớp 2 — Chạy thử chức năng
Kiểm tra các quy trình sử dụng thực tế có hoạt động hay không.

Ví dụ:
- đăng nhập được
- tạo hoặc truy cập không gian làm việc được
- tải tài liệu lên được
- xem trước tài liệu được
- đặt câu hỏi dựa trên tài liệu được

Cần cả hai lớp kiểm tra để tin tưởng vào bản cài đặt doanh nghiệp.

---

## Danh sách kiểm tra trước — Cấu hình cơ bản Chế độ A

### Cấu hình ứng dụng chính
- [ ] `NEXT_PUBLIC_APP_URL` được thiết lập đúng
- [ ] `NODE_ENV` được thiết lập phù hợp
- [ ] có đầy đủ thông tin bí mật ứng dụng bắt buộc
- [ ] đã cấu hình thông tin bí mật của tác vụ cron/tuyến nội bộ

### Xác thực
- [ ] có nhà cung cấp và cấu hình xác thực
- [ ] URL callback/chuyển hướng khớp với URL triển khai
- [ ] quy trình đăng nhập thử hoạt động hoặc ít nhất được cấu hình đúng

### Cơ sở dữ liệu
- [ ] có URL hoặc cấu hình cơ sở dữ liệu chính
- [ ] có thông tin xác thực vai trò dịch vụ/quản trị khi cần
- [ ] ứng dụng kết nối cơ sở dữ liệu thành công
- [ ] đã áp dụng migration thành công

### Lưu trữ
- [ ] có bucket hoặc cấu hình lưu trữ
- [ ] ứng dụng ghi được vào bộ lưu trữ
- [ ] ứng dụng đọc được từ bộ lưu trữ
- [ ] đường tải lên có chữ ký hoạt động nếu được sử dụng

### Cấu hình mô hình/nhà cung cấp
- [ ] đã cấu hình ít nhất một nhà cung cấp chat/suy luận được hỗ trợ
- [ ] đã cấu hình ít nhất một nhà cung cấp embedding được hỗ trợ
- [ ] hiểu cơ chế chọn nhà cung cấp và dự phòng

### Kiểm tra tính năng tùy chọn
- [ ] các hệ thống con tùy chọn đang tắt không cần thiết cho bản cài đặt cơ bản
- [ ] thiếu cấu hình tích hợp tùy chọn không làm hỏng các chức năng cốt lõi

---

## Danh sách chạy thử — Cấu hình cơ bản Chế độ A

### 1. Khởi động ứng dụng
- [ ] ứng dụng tải được ở URL công khai
- [ ] các tuyến công khai hiển thị thành công
- [ ] giao diện có xác thực tải được sau đăng nhập

### 2. Xác thực
- [ ] người dùng đăng nhập được
- [ ] phiên được thiết lập
- [ ] được phép truy cập các khu vực đã xác thực

### 3. Không gian làm việc
- [ ] có thể tạo hoặc truy cập không gian làm việc
- [ ] các tuyến thuộc không gian làm việc tải thành công
- [ ] không có vòng lặp hướng dẫn hoặc lỗi tạo cấu hình trùng lặp chặn lần sử dụng đầu tiên

### 4. Tải tài liệu lên
- [ ] tải được tài liệu TXT/MD/PDF
- [ ] tải lên hoàn tất mà không có lỗi truyền tải
- [ ] URI lưu trữ được tạo và lưu lại
- [ ] tài liệu xuất hiện trong giao diện không gian làm việc

### 5. Xem trước tài liệu
- [ ] xem trước được tài liệu đã tải lên và xử lý xong
- [ ] bản xem trước trả về nội dung trích xuất có thể đọc được
- [ ] hiểu và kiểm tra được hành vi của tài liệu cá nhân và tài liệu không gian làm việc khi áp dụng

### 6. Truy vấn dựa trên tài liệu
- [ ] có thể đặt câu hỏi dựa trên tài liệu
- [ ] mô hình dùng nội dung thật của tài liệu đã tải lên, không chỉ siêu dữ liệu tên tệp
- [ ] không có lỗi không tương thích RPC truy xuất ngăn đưa ngữ cảnh vào

### 7. Bộ nhớ và ngữ cảnh cơ bản
- [ ] quá trình tập hợp ngữ cảnh hoạt động không có lỗi nghiêm trọng
- [ ] ngữ cảnh tài liệu được đưa vào khi cần
- [ ] không quan sát thấy rò rỉ phạm vi giữa các không gian làm việc hoặc tài liệu

### 8. Bảo vệ API chính
- [ ] các tuyến nội bộ/cron được bảo vệ từ chối xác thực không hợp lệ
- [ ] các tuyến nội bộ/cron được bảo vệ chấp nhận xác thực hợp lệ

---

## Kịch bản chạy thử được khuyến nghị

Một bản cài đặt doanh nghiệp cơ bản cần hoàn thành các bước sau:

1. triển khai ứng dụng và cơ sở dữ liệu
2. cấu hình xác thực và lưu trữ
3. đăng nhập
4. tạo hoặc truy cập không gian làm việc
5. tải lên tệp PDF
6. xác nhận tài liệu xuất hiện trong danh sách
7. xem trước tài liệu
8. hỏi “Tóm tắt tài liệu tôi vừa tải lên”
9. nhận câu trả lời dựa trên nội dung thực của tài liệu

Nếu kịch bản này thất bại, chưa thể coi bản cài đặt là sẵn sàng sử dụng.

---

## Phân loại lỗi

Khi kiểm tra hoặc chạy thử thất bại, cần phân loại rõ nguyên nhân.

### Lỗi cấu hình
Ví dụ:
- thiếu biến môi trường
- thông tin bí mật có định dạng sai
- kết hợp các nhà cung cấp không được hỗ trợ

### Lỗi dịch vụ phụ thuộc
Ví dụ:
- không kết nối được cơ sở dữ liệu
- không truy cập được bộ lưu trữ
- URL callback xác thực không khớp

### Lỗi quy trình sản phẩm
Ví dụ:
- tải lên thành công nhưng xem trước thất bại
- tài liệu tồn tại nhưng mô hình không phân tích được
- tạo không gian làm việc bị lặp hoặc tạo bản trùng

### Lỗi phạm vi/ranh giới
Ví dụ:
- dùng sai ngữ cảnh không gian làm việc
- bỏ qua sai việc truy xuất tài liệu cá nhân
- bản xem trước yêu cầu workspaceId khi không cần thiết

---

## Khuyến nghị cuối cùng

Chỉ nên coi bản cài đặt doanh nghiệp là hoạt động tốt khi vượt qua:
- kiểm tra cấu hình trước vận hành
- kết nối đến các dịch vụ phụ thuộc
- chạy thử không gian làm việc, tải lên, xem trước và truy vấn tài liệu

Đây là mức tối thiểu để tự lưu trữ cho doanh nghiệp một cách đáng tin cậy.
