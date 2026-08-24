import { ApiProperty } from '@nestjs/swagger';
import { attachment_type } from '../../../generated/prisma/enums';

export class UploadedAttachmentDto {
  @ApiProperty({
    description:
      "URL of the uploaded file — pass this straight into a message's `attachments`.",
  })
  file_url: string;

  @ApiProperty({
    enum: attachment_type,
    description: "Detected from the file's content type.",
  })
  file_type: attachment_type;

  constructor(input: { file_url: string; file_type: attachment_type }) {
    this.file_url = input.file_url;
    this.file_type = input.file_type;
  }
}
