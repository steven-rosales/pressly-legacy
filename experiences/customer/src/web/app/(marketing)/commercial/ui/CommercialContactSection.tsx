'use client';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '#customer/components/ui/form';
import { Input } from '#customer/components/ui/input';
import { Textarea } from '#customer/components/ui/textarea';
import { usePublicEventTracker } from '#customer/telemetry/use-public-event-tracker';
import { Button } from '#customer/components/ui/button';
import type { CommercialPageModel } from '../model';
import { useCommercialInquiryViewModel } from '../view-model';

export default function CommercialContactSection({
  model,
}: {
  model: CommercialPageModel;
}) {
  const track = usePublicEventTracker();
  const { form, submit } = useCommercialInquiryViewModel(track);

  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start w-full">
      <div className="w-full lg:w-1/2">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold mb-4 lg:mb-6">
          {model.contact.title}
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground mb-6 lg:mb-8">
          {model.contact.description}
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {model.contact.fields.companyName.label}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={model.contact.fields.companyName.placeholder}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {model.contact.fields.firstName.label}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={model.contact.fields.firstName.placeholder}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{model.contact.fields.lastName.label}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={model.contact.fields.lastName.placeholder}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{model.contact.fields.email.label}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={model.contact.fields.email.placeholder}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{model.contact.fields.phone.label}</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder={model.contact.fields.phone.placeholder}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{model.contact.fields.location.label}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={model.contact.fields.location.placeholder}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="needs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{model.contact.fields.needs.label}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={model.contact.fields.needs.placeholder}
                      className="min-h-[120px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              size="lg"
              className="w-full cursor-pointer bg-primary text-base text-primary-foreground"
            >
              {model.contact.submitLabel}
            </Button>
          </form>
        </Form>
      </div>

      <div className="w-full lg:w-1/2">
        <h3 className="text-2xl sm:text-3xl font-semibold mb-4">
          {model.story.title}
        </h3>
        <div className="space-y-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
          {model.story.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
